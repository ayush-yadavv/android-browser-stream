package domain_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/user/android-browser-stream/backend/domain"
)

func TestNegotiateCodec(t *testing.T) {
	serverSupported := []domain.VideoCodec{
		domain.CodecAV1,
		domain.CodecH265,
		domain.CodecH264,
	}

	t.Run("matches highest preference codec requested by client", func(t *testing.T) {
		requested := []string{"av1", "h264"}
		codec, wireID := domain.NegotiateCodec(requested, serverSupported)
		assert.Equal(t, domain.CodecAV1, codec)
		assert.Equal(t, domain.WireCodecAV1, wireID)
	})

	t.Run("matches second preference if first not supported", func(t *testing.T) {
		limitedServer := []domain.VideoCodec{domain.CodecH265, domain.CodecH264}
		requested := []string{"av1", "h265", "h264"}
		codec, wireID := domain.NegotiateCodec(requested, limitedServer)
		assert.Equal(t, domain.CodecH265, codec)
		assert.Equal(t, domain.WireCodecH265, wireID)
	})

	t.Run("defaults to H264 on empty or unsupported request", func(t *testing.T) {
		codec, wireID := domain.NegotiateCodec([]string{"vp9", "unknown"}, serverSupported)
		assert.Equal(t, domain.CodecH264, codec)
		assert.Equal(t, domain.WireCodecH264, wireID)

		codecEmpty, wireIDEmpty := domain.NegotiateCodec(nil, serverSupported)
		assert.Equal(t, domain.CodecH264, codecEmpty)
		assert.Equal(t, domain.WireCodecH264, wireIDEmpty)
	})
}
