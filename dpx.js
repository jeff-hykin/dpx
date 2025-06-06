import { FileSystem } from "https://deno.land/x/quickr@0.6.72/main/file_system.js"
import { Console, cyan, magenta, green } from "https://deno.land/x/quickr@0.6.72/main/console.js"
import { parseArgs, flag, required, initialValue } from "https://deno.land/x/good@1.13.1.0/flattened/parse_args.js"
import { toCamelCase } from "https://deno.land/x/good@1.13.1.0/flattened/to_camel_case.js"
import { didYouMean } from "https://deno.land/x/good@1.13.1.0/flattened/did_you_mean.js"
import * as Path from "https://deno.land/std@0.128.0/path/mod.ts"
import { parse } from "https://esm.sh/@jsr/std__jsonc@1.0.1";

const shellEscape = (arg)=>{
    if (arg.match(/^[a-zA-Z_@\-:\.\/]+$/)) {
        return arg
    }
    // todo: do a better job for windows
    return `'${arg.replace(/'/g,`'"'"'`)}'`
}

const walkUpUntil = async function(subPaths) {
    let here = Deno.cwd()
    while (1) {
        for (const eachSubPath of subPaths) {
            let checkPath = Path.join(here, eachSubPath)
            const pathInfo = await Deno.lstat(checkPath).catch(()=>({doesntExist: true}))
            if (!pathInfo.doesntExist) {
                return here
            }
        }
        // reached the top
        if (here == Path.dirname(here)) {
            return null
        } else {
            // go up a folder
            here = Path.dirname(here)
        }
    }
}

const allArgs = parseArgs({
    rawArgs: Deno.args,
    fields: [
        [["--help", ], flag, initialValue(false) ],
        [["--version"], flag, initialValue(false)  ],
        [["--install", "-i"], flag, initialValue(false)  ],
        [["--name", "-n"], initialValue(null) ],
    ],
    nameTransformer: toCamelCase,
    namedArgsStopper: "--",
    allowNameRepeats: true,
    valueTransformer: (value)=>value,
    isolateArgsAfterStopper: false,
    implicitNamePattern: null,
    implictFlagPattern: null,
})
let { version, help, install, name } = allArgs.simplifiedNames
if (version) {
    console.log(`0.0.1`)
    Deno.exit(0)
}

if (help || Deno.args.length == 0) {
    console.log(`
    Example:
        # install
        dpx --install -A npm:vite
        
        # use
        dpx vite
    `)
    Deno.exit(0)
}

// 
// install
// 
if (install) {
    const installArgs = allArgs.argList
    const argsForRunCommand = []
    for (let each of installArgs) {
        if (each == "--global" || each == "--force") {
            continue
        }
        if (each.match(/^-[a-zA-Z0-9\-_]+$/)) {
            // remove/ignore global and force args
            each = each.replace(/[fg]/g, "")
        }
        argsForRunCommand.push(each)
    }
    let fields
    const parsedInstallArgs = parseArgs({
        rawArgs: argsForRunCommand,
        fields: fields = [
            [["--import-map", ], ],
            [["--config", "-c" ], ],
            [["--lock", ], ],
            [["--cert", ], ],
            [["--location", ], ],
            [["--seed", ], ],
            [["--ext", ], ],
        ],
        nameTransformer: toCamelCase,
        namedArgsStopper: "--",
        allowNameRepeats: true,
        valueTransformer: (value)=>value,
        isolateArgsAfterStopper: false,
        implicitNamePattern: null,
        // basically assume everything is a flag unless its mentioned above
        // implictFlagPattern: null,
        implictFlagPattern: /^(--|-)\w+.*$/,
        // implictFlagPattern: /^(--|-)[a-zA-Z0-9\-_]+$/,
        // implictFlagPattern: /^(--[a-zA-Z0-9\-_]+|-[a-zA-Z0-9\-_]+)$/,
    })
    const isValidInstallSpecifier = name=>name.match(/^(https?:|jsr:|npm:|\.\/|\/)/) // TODO: windows absolute path 
    const thingToInstall = parsedInstallArgs.argList.filter(isValidInstallSpecifier).slice(-1)[0]
    if (thingToInstall == null) {
        let maybeActualInstallArg = argsForRunCommand.filter(isValidInstallSpecifier).slice(-1)[0]
        if (maybeActualInstallArg) {
            throw Error(`I think you have a bad argument infront of ${maybeActualInstallArg}\nFor example:\n    --config ./my_config npm:vite # good\n    --config npm:vite # bad/broken`)
        } else {
            throw Error(`Sorry, to install a package at least one argument should either be a file path (start with ./ or /) or start with https:, jsr:, or npm:`)
        }
    }

    // 
    // load deno.json
    // 
        const firstAttempt = await walkUpUntil(["deno.json","deno.jsonc","deno.lock"])
        const projectFolder = firstAttempt || (await walkUpUntil(["package.json",".git","node_modules"]))||await Deno.cwd()
        let denoJsonPath = `${projectFolder}/deno.jsonc`
        let denoJsonString
        let currentJson
        if (denoJsonString = FileSystem.sync.read(denoJsonPath)) {
            currentJson = parse(denoJsonString)
        } else if (denoJsonString = FileSystem.sync.read(denoJsonPath=denoJsonPath.slice(0,-1))) {
            currentJson = parse(denoJsonString)
        } else {
            currentJson = {}
        }
        currentJson["tasks"] = currentJson["tasks"]||{}
        if (currentJson["tasks"] instanceof Array || !(currentJson["tasks"] instanceof Object)) {
            currentJson["tasks"] = {}
        }
    // 
    // get install name
    // 
        let installName = name
        if (!installName) {
            if (thingToInstall.startsWith("jsr:")||thingToInstall.startsWith("npm:")) {
                installName = thingToInstall.slice(4)
            } else {
                let path = thingToInstall
                if (thingToInstall.match(/^https?:/)) {
                    path = (new URL(thingToInstall)).pathname
                }
                const [ folders, itemName, itemExtensionWithDot ] = FileSystem.pathPieces(path)
                if (itemName.trim().length > 0) {
                    installName = itemName
                } else {
                    throw Error(`I'm unable to automatically get a name from ${JSON.stringify(thingToInstall)}\nPlease give a --name <name_you_want> arg`)
                }
            }
        }
    // 
    // add to deno.json
    // 
        currentJson.tasks[installName] = `deno run ${argsForRunCommand.map(each=>shellEscape(each)).join(" ")}`
        await FileSystem.write({
            data: JSON.stringify(currentJson, 0, 2),
            path: denoJsonPath,
        })
        console.log(`Done! ${green(installName)} added to ${FileSystem.basename(denoJsonPath)}. Try it now with ${cyan`dpx ${shellEscape(installName)}`}`)
    
    Deno.exit(0)
}

// 
// run cli tool
// 
{
    // 
    // load deno.json
    // 
    const firstAttempt = await walkUpUntil(["deno.jsonc", "deno.json",])
    let currentJson = {}
    if (firstAttempt) {
        const denoJsonPath = `${firstAttempt}/deno.jsonc`
        const denoJsonString = FileSystem.sync.read(denoJsonPath)||FileSystem.sync.read(denoJsonPath.slice(0,-1))
        if (denoJsonString) {
            currentJson = parse(denoJsonString)
        }
    } else {
        const projectFolder = (await walkUpUntil(["deno.lock", "package.json",".git","node_modules"]))||await Deno.cwd()
        if (!await Console.askFor.yesNo(`I don't see a ${cyan(`deno.json`)}\nDo you want me to create one at ${cyan(projectFolder)}? (y/n)`)) {
            console.log(`Okay, I need a deno.json so please add one in the current or one of the parent folders`)
            Deno.exit(1)
        }
        
        const denoJsonPath = `${projectFolder}/deno.jsonc`
        await FileSystem.write({
            data: JSON.stringify(currentJson, 0, 2),
            path: denoJsonPath,
        })
    }
    currentJson["tasks"] = currentJson["tasks"]||{}
    if (currentJson["tasks"] instanceof Array || !(currentJson["tasks"] instanceof Object)) {
        currentJson["tasks"] = {}
    }

    const taskName = allArgs.argList[0]
    if (currentJson.tasks[taskName]) {
        const command = new Deno.Command(Deno.execPath(), {
            args: [
                "task",
                ...allArgs.argList,
            ],
        })
        const child = command.spawn()
        const status = await child.status
        Deno.exit(status.code)
    } else {
        if (!await Console.askFor.yesNo(`I don't see a ${cyan(taskName)} task in your deno.json\nWould you want me to install --allow-all ${cyan`npm:${taskName}`} and then run it? (y/n)`)) {
            console.log(`Okay, please install ${cyan(taskName)} then\nEx: ${cyan`dpx --install --allow-all --name ${taskName} <source>`}`)
            Deno.exit(1)
        }
        
        // install it 
        var command = new Deno.Command(Deno.execPath(), {
            args: [
                "run",
                "-A",
                import.meta.url,
                "--install",
                "--allow-all",
                `npm:${taskName}`,
            ],
        })
        var child = command.spawn()
        var status = await child.status
        if (status.code != 0) {
            Deno.exit(status.code)
        }
        
        // re-run self
        var command = new Deno.Command(Deno.execPath(), {
            args: [
                "task",
                ...allArgs.argList,
            ],
        })
        var child = command.spawn()
        var status = await child.status
        Deno.exit(status.code)
    }
}
