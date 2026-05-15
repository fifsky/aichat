.PHONY: build install

PREFIX ?= /usr/local
BINDIR ?= $(PREFIX)/bin
BIN := dist/ai
INSTALL ?= install

build:
	bun run build

install: build
	@if [ -w "$(BINDIR)" ]; then \
		$(INSTALL) -m 0755 "$(BIN)" "$(BINDIR)/ai"; \
	else \
		sudo $(INSTALL) -m 0755 "$(BIN)" "$(BINDIR)/ai"; \
	fi
