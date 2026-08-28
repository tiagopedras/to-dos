# to-dos

Read [README.md](README.md) first. Everything in `data/` is private and gitignored.

## Writing a report

When Tiago asks for a report on what has been done, write it to `data/reports/`
as a Markdown file with the frontmatter the board expects, and follow the rules
in README.md under **Rules for writing a report**. Read them before drafting.
The short version is that a report never lists individual to-dos, it says what
moved and what it means, and it is written in his voice and kept short.

## Pushing

This repo lives on the **personal** GitHub account, `tiagopedras`. Push as that
account — `gh auth switch --hostname github.com --user tiagopedras` if it isn't
already active. Note that a `GITHUB_TOKEN` set in the environment can override
that switch and force the work account; unset it for the shell doing the push.
