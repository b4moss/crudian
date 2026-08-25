package crudian

import "fmt"

// Error is the library's minimal typed error.
type Error struct {
	Msg string
}

func (e *Error) Error() string { return e.Msg }

func NewError(msg string) error { return &Error{Msg: msg} }

func AssertString(v any, label string) (string, error) {
	s, ok := v.(string)
	if !ok || s == "" {
		return "", NewError(fmt.Sprintf("%s must be a non-empty string", label))
	}
	return s, nil
}
