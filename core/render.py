"""Renders one of agents/pa_agent/skills/pa/references/templates.md's Mustache templates
against a context dict, and carries out the two rules that file promises
which plain Mustache does not do on its own: a heading line sitting right
above a list block disappears along with it when the list is empty, and a
`lines:` ceiling in the frontmatter truncates the finished text with a
"+N more" rather than letting a template overrun a phone screen.

See IMPROVEMENTS.md, "Every report the PA sends is rendered by hand, so the
templates are instructions rather than code." chevron is the engine — a
small, dependency-free Mustache implementation, chosen over Jinja2 (already
installed, used elsewhere) because templates.md's own "Writing one" section
rules out anything past three primitives: a placeholder, a list block, and
its empty-case twin. Jinja2's expression language would let a template start
doing arithmetic or conditionals, which is exactly what that section says a
template must not need.
"""

import html
import re

import chevron

FRONT_RE = re.compile(r"\A---\n(.*?)\n---\n?", re.S)
FIELD_RE = re.compile(r"^(\w+):\s*(.*)$")
BLOCK_OPEN_RE = re.compile(r"^\{\{[#^](\w+)\}\}$")


def read_template(path):
    """(frontmatter dict, mustache body) for one template file."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    m = FRONT_RE.match(text)
    if not m:
        return {}, text
    front = {}
    for line in m.group(1).splitlines():
        fm = FIELD_RE.match(line)
        if fm:
            front[fm.group(1)] = fm.group(2).strip()
    return front, text[m.end():]


def _is_tag_line(line):
    s = line.strip()
    return s.startswith("{{") and s.endswith("}}")


def _drop_orphan_headings(body, context):
    """The template source, with a block's own heading line removed when
    the list or section it introduces is empty — see this module's own
    docstring. Done to the source before chevron ever sees it: an empty
    `{{#x}}...{{/x}}` renders to nothing chevron will hand back, so there is
    no marker left in the *output* to find the heading above by the time
    rendering is done.
    """
    lines = body.split("\n")
    out = []
    for line in lines:
        m = BLOCK_OPEN_RE.match(line.strip())
        if m and out and out[-1].strip() and not _is_tag_line(out[-1]):
            name = m.group(1)
            negated = line.strip().startswith("{{^")
            empty = not context.get(name)
            # A `{{#name}}` heading belongs to the populated case, so it
            # drops when the list is empty; a `{{^name}}` heading belongs
            # to the empty case, so it drops when the list is not.
            if empty == (not negated):
                out.pop()
        out.append(line)
    return "\n".join(out)


EMPTY = "\x00EMPTY\x00"


def _mark_empty(value):
    """A context with every empty string replaced by a sentinel that
    survives rendering, so the line it sat on can be dropped afterwards —
    "a placeholder with nothing to fill it drops its whole line", the other
    rule templates.md promises that plain Mustache does not carry out on its
    own. Recurses into list items, since a row's own {{due_short}} being
    empty has to drop that row's line the same way a top-level field does.
    A present zero is not touched: `0` is an answer, only `""` is an
    absence.
    """
    if isinstance(value, str):
        return EMPTY if value == "" else value
    if isinstance(value, dict):
        return {k: _mark_empty(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_mark_empty(v) for v in value]
    return value


def _drop_marked_lines(text):
    return "\n".join(line for line in text.split("\n") if EMPTY not in line)


def _cap_lines(text, cap):
    lines = text.rstrip("\n").split("\n")
    if len(lines) <= cap:
        return text
    kept = lines[:max(cap - 1, 0)]
    kept.append("+%d more" % (len(lines) - len(kept)))
    return "\n".join(kept)


def _tidy(text):
    """No more than one blank line in a row — dropping a heading can leave
    two blank lines where the template only ever wrote one each."""
    return re.sub(r"\n{3,}", "\n\n", text)


def render(template_path, context):
    front, body = read_template(template_path)
    source = _drop_orphan_headings(body, context)
    text = chevron.render(source, _mark_empty(context))
    # These are plain-text reports, never HTML, so Mustache's own escaping
    # of &<>"' serves no purpose here and undoing it is always safe — a
    # title carrying a real ampersand should read as one.
    text = html.unescape(text)
    text = _drop_marked_lines(text)
    text = _tidy(text).strip("\n")
    cap = front.get("lines")
    if cap and cap.isdigit():
        text = _cap_lines(text, int(cap))
    return text + "\n"
