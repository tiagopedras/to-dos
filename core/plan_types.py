"""The kinds of work a plan can be, and which of them may run without him.

Decided 21 and 23 Sep 2026 (IMPROVEMENTS.md, "The implementing agent only runs
with Tiago in the room because nothing says which kinds of work it can do
alone"). The Plan agent writes one of these as `type:` in a plan's frontmatter,
`write_plan()` in agents/plan-agent/plan.py reads it back, and two things act on
it:

- the board, which ticks Review the plan by itself for a pre-approved type when
  the Plan agent's tick arrives (`drainTickQueue()`, whose PRE_APPROVED_TYPES
  must match PRE_APPROVED below);
- the Implement agent's runner (agents/implement-agent/hooks.py), which only
  takes an Implement sub-task whose plan names a type in UNATTENDED.

Anything not on these lists, `other` included, waits for `do` and a person in
the room.
"""

TYPES = ("write-up", "draft", "prompt", "data", "deck", "figma", "code", "other")

# Only add new files inside one project folder and send nothing, so the plan
# needs no accept step: the board approves it on arrival.
PRE_APPROVED = ("write-up", "draft")

# May sit beside something that exists, so they write into the project folder,
# never over a file, and save a new version as `name-v2.md` beside the original.
GUARDED = ("prompt", "data", "deck")

# What the runner may take on alone, once the plan's review is ticked. Figma is
# left out: see FIGMA_REFUSAL in agents/implement-agent/hooks.py.
UNATTENDED = PRE_APPROVED + GUARDED + ("code",)


def read(value):
    """A `type:` value as written by an agent, as one of TYPES.

    Strict on purpose: a word that is not on the list is `other`, which nothing
    runs alone, rather than a guess at which type it meant."""
    v = (value or "").strip().strip("`\"'").lower()
    return v if v in TYPES else "other"
