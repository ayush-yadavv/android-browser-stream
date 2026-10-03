package recorder

import (
	"encoding/binary"
	"sync"

	"github.com/user/android-browser-stream/backend/domain"
)

const (
	// TSPacketSize defines the standard 188-byte MPEG-2 Transport Stream packet size.
	TSPacketSize = 188
	// SyncByte defines the invariant MPEG-TS sync marker (0x47).
	SyncByte = 0x47

	// Pre-allocated Program & Stream PIDs
	PIDPAT   = 0x0000
	PIDPMT   = 0x1000
	PIDVideo = 0x0100

	// Stream types according to ISO/IEC 13818-1
	StreamTypeH264 = 0x1B
	StreamTypeH265 = 0x24
)

// mpeg2CRC calculates the standard MPEG-2 32-bit CRC (polynomial 0x04C11DB7).
func mpeg2CRC(data []byte) uint32 {
	crc := uint32(0xFFFFFFFF)
	for _, b := range data {
		for i := 0; i < 8; i++ {
			bit := (b>>(7-i)&1) == 1
			c31 := (crc>>31&1) == 1
			crc <<= 1
			if c31 != bit {
				crc ^= 0x04C11DB7
			}
		}
	}
	return crc
}

// TSMuxer packages raw video packets into a stream of 188-byte MPEG-TS packets
// with explicit 90kHz presentation timestamps (PTS) to preserve real wallclock pacing.
type TSMuxer struct {
	codec      domain.VideoCodec
	cc         byte
	patCC      byte
	pmtCC      byte
	firstPTS   int64
	hasFirst   bool
	pendingCfg []byte
	mu         sync.Mutex
}

// NewTSMuxer constructs a new MPEG-TS muxer configured for the given video codec.
func NewTSMuxer(codec domain.VideoCodec) *TSMuxer {
	return &TSMuxer{
		codec: codec,
	}
}

// InitHeaders returns the initial PAT and PMT tables needed at the start of an MPEG-TS stream.
func (m *TSMuxer) InitHeaders() []byte {
	m.mu.Lock()
	defer m.mu.Unlock()

	pat := m.makePAT()
	pmt := m.makePMT()

	res := make([]byte, len(pat)+len(pmt))
	copy(res[:len(pat)], pat)
	copy(res[len(pat):], pmt)
	return res
}

// Packetize converts a domain.VideoPacket into a series of 188-byte MPEG-TS packets.
// Returns nil if the packet is codec configuration (which is buffered until the next keyframe).
func (m *TSMuxer) Packetize(pkt *domain.VideoPacket) []byte {
	if pkt == nil || len(pkt.Data) == 0 {
		return nil
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// If this is SPS/PPS/VPS codec configuration, buffer it and prepend to the next keyframe
	if pkt.IsConfig {
		m.pendingCfg = append(m.pendingCfg, pkt.Data...)
		return nil
	}

	// Establish stream baseline PTS from the first presentation frame
	if !m.hasFirst {
		m.firstPTS = pkt.PTS
		m.hasFirst = true
	}

	relPTS := pkt.PTS - m.firstPTS
	if relPTS < 0 {
		relPTS = 0
	}

	// Convert microseconds to 90 kHz MPEG clock (90 ticks per millisecond)
	pts90k := uint64(relPTS*90/1000) & 0x1FFFFFFFF // 33-bit timestamp

	// Combine pending SPS/PPS headers if this is a keyframe
	var frameData []byte
	if pkt.IsKeyFrame && len(m.pendingCfg) > 0 {
		frameData = make([]byte, len(m.pendingCfg)+len(pkt.Data))
		copy(frameData, m.pendingCfg)
		copy(frameData[len(m.pendingCfg):], pkt.Data)
		m.pendingCfg = nil
	} else {
		frameData = pkt.Data
	}

	// Construct 14-byte PES Header
	pesLen := 14 + len(frameData)
	pes := make([]byte, pesLen)
	pes[0] = 0x00
	pes[1] = 0x00
	pes[2] = 0x01
	pes[3] = 0xE0 // Stream ID: Video stream 0
	pes[4] = 0x00 // PES packet length (0 = unbounded length for video streams)
	pes[5] = 0x00
	pes[6] = 0x80 // Flags: Marker bit
	pes[7] = 0x80 // Flags: PTS present, DTS absent
	pes[8] = 0x05 // Header data length (5 bytes for PTS)

	// Encode 33-bit PTS according to ISO/IEC 13818-1
	pes[9] = 0x21 | byte((pts90k>>29)&0x0E)
	pes[10] = byte((pts90k >> 22) & 0xFF)
	pes[11] = 0x01 | byte((pts90k>>14)&0xFE)
	pes[12] = byte((pts90k >> 7) & 0xFF)
	pes[13] = 0x01 | byte((pts90k<<1)&0xFE)

	copy(pes[14:], frameData)

	// Slice PES payload into 188-byte Transport Stream packets
	var tsPackets []byte
	offset := 0
	total := len(pes)
	first := true

	for offset < total {
		remaining := total - offset
		if remaining >= 184 {
			chunk := pes[offset : offset+184]
			offset += 184

			var pusi byte = 0x00
			if first {
				pusi = 0x40
			}

			header := []byte{
				SyncByte,
				pusi | byte((PIDVideo>>8)&0x1F),
				byte(PIDVideo & 0xFF),
				0x10 | (m.cc & 0x0F), // Payload only
			}
			tsPackets = append(tsPackets, header...)
			tsPackets = append(tsPackets, chunk...)
		} else {
			chunk := pes[offset:]
			pad := 184 - len(chunk) // Stuffing bytes needed

			var pusi byte = 0x00
			if first {
				pusi = 0x40
			}

			header := []byte{
				SyncByte,
				pusi | byte((PIDVideo>>8)&0x1F),
				byte(PIDVideo & 0xFF),
				0x30 | (m.cc & 0x0F), // Adaptation field followed by payload
			}
			tsPackets = append(tsPackets, header...)

			if pad == 1 {
				// Single-byte adaptation field (length = 0)
				tsPackets = append(tsPackets, 0x00)
			} else {
				// Multi-byte adaptation field: length byte + flags byte + stuffing
				adapt := make([]byte, pad)
				adapt[0] = byte(pad - 1)
				adapt[1] = 0x00 // Flags: No PCR, no OPCR, no splice
				for i := 2; i < pad; i++ {
					adapt[i] = 0xFF // Standard stuffing byte
				}
				tsPackets = append(tsPackets, adapt...)
			}
			tsPackets = append(tsPackets, chunk...)
			offset = total
		}
		m.cc = (m.cc + 1) & 0x0F
		first = false
	}

	return tsPackets
}

func (m *TSMuxer) makePAT() []byte {
	payload := make([]byte, 184)
	payload[0] = 0x00 // Pointer field
	payload[1] = 0x00 // table_id (PAT)
	payload[2] = 0xB0 // section_syntax(1), reserved(11), length high 4 bits
	payload[3] = 0x0D // section_length: 13 bytes
	payload[4] = 0x00 // transport_stream_id (0x0001)
	payload[5] = 0x01
	payload[6] = 0xC1 // version(0), current_next(1)
	payload[7] = 0x00 // section_number (0)
	payload[8] = 0x00 // last_section_number (0)
	payload[9] = 0x00 // program_number (0x0001)
	payload[10] = 0x01
	payload[11] = 0xE0 | byte((PIDPMT>>8)&0x1F) // Reserved (3 bits 0xE0) + PMT PID high 5 bits
	payload[12] = byte(PIDPMT & 0xFF)

	crc := mpeg2CRC(payload[1:13])
	binary.BigEndian.PutUint32(payload[13:17], crc)

	for i := 17; i < 184; i++ {
		payload[i] = 0xFF // Stuffing
	}

	pkt := make([]byte, TSPacketSize)
	pkt[0] = SyncByte
	pkt[1] = 0x40 | byte((PIDPAT>>8)&0x1F) // PUSI = 1
	pkt[2] = byte(PIDPAT & 0xFF)
	pkt[3] = 0x10 | (m.patCC & 0x0F)
	copy(pkt[4:], payload)
	m.patCC = (m.patCC + 1) & 0x0F
	return pkt
}

func (m *TSMuxer) makePMT() []byte {
	streamType := byte(StreamTypeH264)
	if m.codec == domain.CodecH265 {
		streamType = StreamTypeH265
	}

	payload := make([]byte, 184)
	payload[0] = 0x00 // Pointer field
	payload[1] = 0x02 // table_id (PMT)
	payload[2] = 0xB0 // section_syntax(1), reserved(11), length high 4 bits
	payload[3] = 0x12 // section_length: 18 bytes
	payload[4] = 0x00 // program_number (0x0001)
	payload[5] = 0x01
	payload[6] = 0xC1 // version(0), current_next(1)
	payload[7] = 0x00 // section_number (0)
	payload[8] = 0x00 // last_section_number (0)
	payload[9] = 0xE0 | byte((PIDVideo>>8)&0x1F) // PCR_PID (0x0100)
	payload[10] = byte(PIDVideo & 0xFF)
	payload[11] = 0xF0 // program_info_length (0)
	payload[12] = 0x00

	// Video Elementary Stream entry
	payload[13] = streamType                      // 0x1B (H264) or 0x24 (H265)
	payload[14] = 0xE0 | byte((PIDVideo>>8)&0x1F) // Elementary PID (0x0100)
	payload[15] = byte(PIDVideo & 0xFF)
	payload[16] = 0xF0 // ES_info_length (0)
	payload[17] = 0x00

	crc := mpeg2CRC(payload[1:18])
	binary.BigEndian.PutUint32(payload[18:22], crc)

	for i := 22; i < 184; i++ {
		payload[i] = 0xFF // Stuffing
	}

	pkt := make([]byte, TSPacketSize)
	pkt[0] = SyncByte
	pkt[1] = 0x40 | byte((PIDPMT>>8)&0x1F) // PUSI = 1
	pkt[2] = byte(PIDPMT & 0xFF)
	pkt[3] = 0x10 | (m.pmtCC & 0x0F)
	copy(pkt[4:], payload)
	m.pmtCC = (m.pmtCC + 1) & 0x0F
	return pkt
}
