package domain

import "strings"

// VideoCodec defines supported video encoding standards.
type VideoCodec string

const (
	CodecH264 VideoCodec = "h264"
	CodecH265 VideoCodec = "h265"
	CodecAV1  VideoCodec = "av1"
)

// Binary wire IDs for Channel 0x04 metadata handshake
const (
	WireCodecH264 byte = 0x01
	WireCodecH265 byte = 0x02
	WireCodecAV1  byte = 0x03
)

// CodecWireID returns the 1-byte wire identifier for a VideoCodec.
func CodecWireID(codec VideoCodec) byte {
	switch codec {
	case CodecH265:
		return WireCodecH265
	case CodecAV1:
		return WireCodecAV1
	default:
		return WireCodecH264
	}
}

// NegotiateCodec selects the preferred codec requested by client that matches server support.
// Falls back to CodecH264 (universal baseline) if no match or empty.
func NegotiateCodec(requested []string, serverSupported []VideoCodec) (VideoCodec, byte) {
	for _, req := range requested {
		normalized := strings.TrimSpace(strings.ToLower(req))
		for _, supp := range serverSupported {
			if normalized == string(supp) {
				return supp, CodecWireID(supp)
			}
		}
	}
	return CodecH264, WireCodecH264
}
