package crudian

import (
	"fmt"
	"reflect"
)

type compiledWhere struct {
	SQL       string
	Args      []any
	NextIndex int // next 1-based placeholder index
}

func compileWhere(d Dialect, node WhereNode, startIndex int) (compiledWhere, error) {
	if startIndex < 1 {
		startIndex = 1
	}
	if node == nil {
		return compiledWhere{NextIndex: startIndex}, nil
	}
	switch n := node.(type) {
	case GroupNode:
		if len(n.Children) == 0 {
			return compiledWhere{NextIndex: startIndex}, nil
		}
		parts := make([]string, 0, len(n.Children))
		args := make([]any, 0)
		idx := startIndex
		for _, child := range n.Children {
			c, err := compileWhere(d, child, idx)
			if err != nil {
				return compiledWhere{}, err
			}
			if c.SQL == "" {
				continue
			}
			parts = append(parts, "("+c.SQL+")")
			args = append(args, c.Args...)
			idx = c.NextIndex
		}
		if len(parts) == 0 {
			return compiledWhere{NextIndex: startIndex}, nil
		}
		if len(parts) == 1 {
			sql := parts[0]
			return compiledWhere{SQL: sql[1 : len(sql)-1], Args: args, NextIndex: idx}, nil
		}
		join := " AND "
		if n.Type == "or" {
			join = " OR "
		}
		out := parts[0]
		for i := 1; i < len(parts); i++ {
			out += join + parts[i]
		}
		return compiledWhere{SQL: out, Args: args, NextIndex: idx}, nil
	case CondNode:
		col, err := AssertString(n.Column, "column")
		if err != nil {
			return compiledWhere{}, err
		}
		q := d.QuoteIdent(col)
		idx := startIndex
		switch n.Op {
		case OpEq:
			return compiledWhere{SQL: q + " = " + d.Placeholder(idx), Args: []any{n.Value}, NextIndex: idx + 1}, nil
		case OpNe:
			return compiledWhere{SQL: q + " <> " + d.Placeholder(idx), Args: []any{n.Value}, NextIndex: idx + 1}, nil
		case OpLt:
			return compiledWhere{SQL: q + " < " + d.Placeholder(idx), Args: []any{n.Value}, NextIndex: idx + 1}, nil
		case OpGt:
			return compiledWhere{SQL: q + " > " + d.Placeholder(idx), Args: []any{n.Value}, NextIndex: idx + 1}, nil
		case OpLte:
			return compiledWhere{SQL: q + " <= " + d.Placeholder(idx), Args: []any{n.Value}, NextIndex: idx + 1}, nil
		case OpGte:
			return compiledWhere{SQL: q + " >= " + d.Placeholder(idx), Args: []any{n.Value}, NextIndex: idx + 1}, nil
		case OpLike:
			return compiledWhere{SQL: q + " LIKE " + d.Placeholder(idx), Args: []any{n.Value}, NextIndex: idx + 1}, nil
		case OpIsNull:
			return compiledWhere{SQL: q + " IS NULL", Args: nil, NextIndex: idx}, nil
		case OpIsNotNull:
			return compiledWhere{SQL: q + " IS NOT NULL", Args: nil, NextIndex: idx}, nil
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
				ph[i] = d.Placeholder(idx)
				idx++
			}
			return compiledWhere{
				SQL:       fmt.Sprintf("%s IN (%s)", q, joinComma(ph)),
				Args:      vals,
				NextIndex: idx,
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

type searchSQLExtras struct {
	selectSQL  string
	groupBySQL string
	orderBySQL string
	hasGroupBy bool
}

func validateSearchExtras(query SearchQuery, paging string) error {
	if query.OrderBy != nil {
		for _, clause := range query.OrderBy {
			if _, err := AssertString(clause.Column, "orderBy.column"); err != nil {
				return NewError("orderBy.column must be a non-empty string")
			}
			if clause.Direction != "" && clause.Direction != "asc" && clause.Direction != "desc" {
				return NewError("orderBy.direction must be \"asc\" or \"desc\"")
			}
		}
	}
	if query.GroupBy != nil {
		if len(query.GroupBy) == 0 {
			return NewError("groupBy must not be empty")
		}
		for _, col := range query.GroupBy {
			if _, err := AssertString(col, "groupBy column"); err != nil {
				return NewError("groupBy column must be a non-empty string")
			}
		}
	}
	if query.Aggregates != nil {
		if len(query.GroupBy) == 0 {
			return NewError("aggregates require groupBy")
		}
		for _, agg := range query.Aggregates {
			switch agg.Fn {
			case "count", "sum", "avg", "min", "max":
			default:
				return NewError("aggregate.fn is invalid")
			}
			if agg.As == "" {
				return NewError("aggregate.as must be a non-empty string")
			}
			if agg.Fn != "count" && agg.Column == "" {
				return NewError("aggregate.column is required")
			}
		}
	}
	if paging == "cursor" && len(query.OrderBy) > 0 {
		return NewError("cursor paging does not accept orderBy")
	}
	if paging == "cursor" && len(query.GroupBy) > 0 {
		return NewError("cursor paging does not accept groupBy")
	}
	return nil
}

func aggregateSQL(d Dialect, agg AggregateSpec) string {
	alias := d.QuoteIdent(agg.As)
	fn := ""
	switch agg.Fn {
	case "count":
		fn = "COUNT"
	case "sum":
		fn = "SUM"
	case "avg":
		fn = "AVG"
	case "min":
		fn = "MIN"
	case "max":
		fn = "MAX"
	}
	if agg.Fn == "count" && agg.Column == "" {
		return fn + "(*) AS " + alias
	}
	return fn + "(" + d.QuoteIdent(agg.Column) + ") AS " + alias
}

func buildSearchSQLExtras(d Dialect, query SearchQuery, pk string) searchSQLExtras {
	hasGroupBy := len(query.GroupBy) > 0
	var selectSQL string
	var groupBySQL string
	if hasGroupBy {
		cols := query.Columns
		if len(cols) == 0 {
			cols = query.GroupBy
		}
		parts := make([]string, 0, len(cols)+len(query.Aggregates))
		for _, c := range cols {
			parts = append(parts, d.QuoteIdent(c))
		}
		for _, agg := range query.Aggregates {
			parts = append(parts, aggregateSQL(d, agg))
		}
		selectSQL = joinComma(parts)
		gb := make([]string, len(query.GroupBy))
		for i, c := range query.GroupBy {
			gb[i] = d.QuoteIdent(c)
		}
		groupBySQL = " GROUP BY " + joinComma(gb)
	} else {
		selectSQL = selectColumns(d, query.Columns)
	}

	var orderBySQL string
	if len(query.OrderBy) > 0 {
		parts := make([]string, len(query.OrderBy))
		for i, c := range query.OrderBy {
			dir := "ASC"
			if c.Direction == "desc" {
				dir = "DESC"
			}
			parts[i] = d.QuoteIdent(c.Column) + " " + dir
		}
		orderBySQL = " ORDER BY " + joinComma(parts)
	} else if hasGroupBy {
		orderBySQL = " ORDER BY " + d.QuoteIdent(query.GroupBy[0]) + " ASC"
	} else {
		orderBySQL = " ORDER BY " + d.QuoteIdent(pk) + " ASC"
	}
	return searchSQLExtras{
		selectSQL:  selectSQL,
		groupBySQL: groupBySQL,
		orderBySQL: orderBySQL,
		hasGroupBy: hasGroupBy,
	}
}
