package bootstrap

import (
	"log"
	"time"

	"github.com/spf13/viper"
)

// Env stores application configuration loaded via Viper.
type Env struct {
	ServerPort        string        `mapstructure:"SERVER_PORT"`
	ContextTimeout    time.Duration `mapstructure:"CONTEXT_TIMEOUT"`
	MaxSessions       int           `mapstructure:"MAX_SESSIONS"`
	ADBPortStart      int           `mapstructure:"ADB_PORT_START"`
	RedroidImage      string        `mapstructure:"REDROID_IMAGE"`
	ScrcpyBinPath     string        `mapstructure:"SCRCPY_BIN_PATH"`
	DBPath            string        `mapstructure:"DB_PATH"`
	PrewarmedPoolSize int           `mapstructure:"PREWARMED_POOL_SIZE"`
}

// NewEnv initializes environment configuration with defaults and overrides.
func NewEnv() *Env {
	env := Env{}
	viper.SetDefault("SERVER_PORT", "8080")
	viper.SetDefault("CONTEXT_TIMEOUT", 10*time.Second)
	viper.SetDefault("MAX_SESSIONS", 3)
	viper.SetDefault("ADB_PORT_START", 5555)
	viper.SetDefault("REDROID_IMAGE", "redroid/redroid:13.0.0-latest")
	viper.SetDefault("SCRCPY_BIN_PATH", "bin/scrcpy-server")
	viper.SetDefault("DB_PATH", "sessions.db")
	viper.SetDefault("PREWARMED_POOL_SIZE", 0)

	viper.AutomaticEnv()
	if err := viper.Unmarshal(&env); err != nil {
		log.Fatalf("unable to decode into struct, %v", err)
	}
	return &env
}
