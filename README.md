# What is this for?

This is the `npx` equivlent for Deno.

# How do I use it?

```shell
# install deno first
curl -fsSL https://deno.land/install.sh | sh
# install dpx
deno install -Afg https://raw.githubusercontent.com/jeff-hykin/dpx/refs/heads/master/dpx.js
```

Usage:
```sh
# install a tool
dpx --install -A npm:vite
dpx --install --name veet -A npm:vite
dpx --install -A https://raw.githubusercontent.com/jeff-hykin/bite/refs/heads/master/vite/bin/vite.js
dpx --install --name bite -A https://raw.githubusercontent.com/jeff-hykin/bite/refs/heads/master/vite/bin/vite.js

# use it
dpx vite
dpx veet
dpx bite
```

# How does it work?

All `dpx --install` does is add a `deno run ...` task to your [deno.json tasks](https://docs.deno.com/runtime/reference/cli/task_runner/)

When you do `dpx vite` its basically a shortcut to `deno task vite`.