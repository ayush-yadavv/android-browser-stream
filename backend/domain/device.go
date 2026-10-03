package domain

// ContainerConfig holds Android container launch parameters.
type ContainerConfig struct {
	Image       string
	ADBPort     int
	Width       int
	Height      int
	DPI         int
	FPS         int
	GPUMode     string
	MemoryLimit  int64
	CPULimit     int64
	KioskEnabled bool
}

// DeviceInfo represents hardware characteristics reported by Android.
type DeviceInfo struct {
	Name   string
	Width  int32
	Height int32
	Codec  uint32
}
