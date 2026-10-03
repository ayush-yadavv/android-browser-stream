package scrcpy_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/scrcpy"
)

func TestServer_CodecDefaultsAndSet(t *testing.T) {
	server := scrcpy.NewServer(nil, "127.0.0.1:5555")
	assert.Equal(t, domain.CodecH264, server.Codec())

	server.SetCodec(domain.CodecAV1)
	assert.Equal(t, domain.CodecAV1, server.Codec())

	server.SetCodec(domain.CodecH265)
	assert.Equal(t, domain.CodecH265, server.Codec())
}

func TestServer_AudioDefaultsAndSet(t *testing.T) {
	server := scrcpy.NewServer(nil, "127.0.0.1:5555")
	assert.True(t, server.AudioEnabled())
	assert.Nil(t, server.AudioConn())

	server.SetAudio(false)
	assert.False(t, server.AudioEnabled())

	server.SetAudio(true)
	assert.True(t, server.AudioEnabled())
}
