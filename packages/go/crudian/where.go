package crudian

type Op string

const (
	OpEq        Op = "eq"
	OpNe        Op = "ne"
	OpLt        Op = "lt"
	OpGt        Op = "gt"
	OpLte       Op = "lte"
	OpGte       Op = "gte"
	OpIn        Op = "in"
	OpLike      Op = "like"
	OpIsNull    Op = "isNull"
	OpIsNotNull Op = "isNotNull"
)

type CondNode struct {
	Type   string
	Op     Op
	Column string
	Value  any
}

type GroupNode struct {
	Type     string // and | or
	Children []WhereNode
}

// WhereNode is CondNode or GroupNode.
type WhereNode interface {
	whereNode()
}

func (CondNode) whereNode()  {}
func (GroupNode) whereNode() {}

// WhereBuilder is the public fluent API.
type WhereBuilder struct {
	node WhereNode
}

func Where() *WhereBuilder {
	return &WhereBuilder{node: GroupNode{Type: "and", Children: nil}}
}

func (w *WhereBuilder) ToNode() WhereNode { return w.node }

func (w *WhereBuilder) appendCond(op Op, column string, value any) *WhereBuilder {
	next := CondNode{Type: "cond", Op: op, Column: column, Value: value}
	if g, ok := w.node.(GroupNode); ok && g.Type == "and" {
		ch := append(append([]WhereNode{}, g.Children...), next)
		return &WhereBuilder{node: GroupNode{Type: "and", Children: ch}}
	}
	return &WhereBuilder{node: GroupNode{Type: "and", Children: []WhereNode{w.node, next}}}
}

func (w *WhereBuilder) Eq(column string, value any) *WhereBuilder {
	return w.appendCond(OpEq, column, value)
}
func (w *WhereBuilder) Ne(column string, value any) *WhereBuilder {
	return w.appendCond(OpNe, column, value)
}
func (w *WhereBuilder) Lt(column string, value any) *WhereBuilder {
	return w.appendCond(OpLt, column, value)
}
func (w *WhereBuilder) Gt(column string, value any) *WhereBuilder {
	return w.appendCond(OpGt, column, value)
}
func (w *WhereBuilder) Lte(column string, value any) *WhereBuilder {
	return w.appendCond(OpLte, column, value)
}
func (w *WhereBuilder) Gte(column string, value any) *WhereBuilder {
	return w.appendCond(OpGte, column, value)
}
func (w *WhereBuilder) In(column string, value any) *WhereBuilder {
	return w.appendCond(OpIn, column, value)
}
func (w *WhereBuilder) Like(column string, value any) *WhereBuilder {
	return w.appendCond(OpLike, column, value)
}
func (w *WhereBuilder) IsNull(column string) *WhereBuilder {
	return w.appendCond(OpIsNull, column, nil)
}
func (w *WhereBuilder) IsNotNull(column string) *WhereBuilder {
	return w.appendCond(OpIsNotNull, column, nil)
}

func (w *WhereBuilder) And(other *WhereBuilder) *WhereBuilder {
	if other == nil {
		return w
	}
	return &WhereBuilder{node: GroupNode{Type: "and", Children: []WhereNode{w.node, other.node}}}
}

func (w *WhereBuilder) Or(other *WhereBuilder) *WhereBuilder {
	if other == nil {
		return w
	}
	return &WhereBuilder{node: GroupNode{Type: "or", Children: []WhereNode{w.node, other.node}}}
}
