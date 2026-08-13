.PHONY: help tree

help:
	@echo "Crudian monorepo"
	@echo ""
	@echo "Targets:"
	@echo "  make tree  Show package layout"

tree:
	@find docs packages -print | sort
