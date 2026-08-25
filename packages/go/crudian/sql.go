package crudian

import (
	"fmt"
	"reflect"
)

type compiledWhere struct {
	SQL  string
	Args []any
}

func compileWhere(d Dialect, node WhereNode) (compiledWhere, error) {
	if node == nil {
		return compiledWhere{}, nil
	}
	switch n := node.(type) {
	case GroupNode:
		if len(n.Children) == 0 {
			return compiledWhere{}, nil
		}
		parts := make([]string, 0, len(n.Children))
		args := make([]any, 0)
		for _, child := range n.Children {
			c, err := compileWhere(d, child)
			if err != nil {
				return compiledWhere{}, err
			}
			if c.SQL == "" {
				continue
			}
			parts = append(parts, "("+c.SQL+")")
			args = append(args, c.Args...)
		}
		if len(parts) == 0 {
			return compiledWhere{}, nil
		}
		if len(parts) == 1 {
			sql := parts[0]
			return compiledWhere{SQL: sql[1 : len(sql)-1], Args: args}, nil
		}
		join := " AND "
		if n.Type == "or" {
			join = " OR "
		}
		out := parts[0]
		for i := 1; i < len(parts); i++ {
			out += join + parts[i]
		}
		return compiledWhere{SQL: out, Args: args}, nil
	case CondNode:
		col, err := AssertString(n.Column, "column")
		if err != nil {
			return compiledWhere{}, err
		}
		q := d.QuoteIdent(col)
		switch n.Op {
		case OpEq:
			return compiledWhere{SQL: q + " = " + d.Placeholder(1), Args: []any{n.Value}}, nil
		case OpNe:
			return compiledWhere{SQL: q + " <> " + d.Placeholder(1), Args: []any{n.Value}}, nil
		case OpLt:
			return compiledWhere{SQL: q + " < " + d.Placeholder(1), Args: []any{n.Value}}, nil
		case OpGt:
			return compiledWhere{SQL: q + " > " + d.Placeholder(1), Args: []any{n.Value}}, nil
		case OpLte:
			return compiledWhere{SQL: q + " <= " + d.Placeholder(1), Args: []any{n.Value}}, nil
		case OpGte:
			return compiledWhere{SQL: q + " >= " + d.Placeholder(1), Args: []any{n.Value}}, nil
		case OpLike:
			return compiledWhere{SQL: q + " LIKE " + d.Placeholder(1), Args: []any{n.Value}}, nil
		case OpIsNull:
			return compiledWhere{SQL: q + " IS NULL", Args: nil}, nil
		case OpIsNotNull:
			return compiledWhere{SQL: q + " IS NOT NULL", Args: nil}, nil
		case OpIn:
			vals, err := asSlice(n.Value)
			if err != nil {
				return compiledWhere{}, err
			}
			if len(vals) == 0 {
				return compiledWhere{}, NewError("in requires a non-empty array")
			}
			ph := make([]string, len(vals))
			for i := range vals {
				ph[i] = d.Placeholder(i + 1)
			}
			return compiledWhere{
				SQL:  fmt.Sprintf("%s IN (%s)", q, joinComma(ph)),
				Args: vals,
			}, nil
		default:
			return compiledWhere{}, NewError("unknown op: " + string(n.Op))
		}
	default:
		return compiledWhere{}, NewError("invalid where node")
	}
}

func resolveWhere(w *WhereBuilder) WhereNode {
	if w == nil {
		return nil
	}
	return w.ToNode()
}

func asSlice(v any) ([]any, error) {
	if v == nil {
		return nil, NewError("in value must be an array")
	}
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice && rv.Kind() != reflect.Array {
		return nil, NewError("in value must be an array")
	}
	out := make([]any, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		out[i] = rv.Index(i).Interface()
	}
	return out, nil
}

func joinComma(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for i := 1; i < len(parts); i++ {
		out += ", " + parts[i]
	}
	return out
}

func selectColumns(d Dialect, columns []string) string {
	if len(columns) == 0 {
		return "*"
	}
	parts := make([]string, len(columns))
	for i, c := range columns {
		parts[i] = d.QuoteIdent(c)
	}
	return joinComma(parts)
}
