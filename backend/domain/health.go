package domain

// HealthResponse represents the standard response payload for health probes.
type HealthResponse struct {
	Status   string `json:"status"`
	Service  string `json:"service"`
	MaxSlots int    `json:"max_slots"`
}
