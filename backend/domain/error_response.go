package domain

// ErrorResponse represents a standardized JSON error envelope.
type ErrorResponse struct {
	Message string `json:"message"`
}
