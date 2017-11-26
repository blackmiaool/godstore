

const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');


module.exports = async function (source, map, socket, opts = {}, notify) {
    opts = Object.assign({
        watch: false,
        delete: false,
        depth: Infinity,
    }, opts);

    const target = '';
    if (typeof opts.depth !== 'number' || isNaN(opts.depth)) {
        notify('error', "Expected valid number for option 'depth'");
        return false;
    }

    // Initial mirror
    const mirrored = await mirror(source, target, opts, notify, 0);
    const sourcePath = source.path;
    if (!mirrored) {
        return false;
    }
    if (opts.watch) {
        // Watcher to keep in sync from that
        chokidar.watch(sourcePath, {
            persistent: true,
            depth: opts.depth,
            ignoreInitial: true,
        }).on('ready', notify.bind(undefined, 'watch', sourcePath))
            .on('add', watcherCopy(sourcePath, target, opts, notify))
            .on('addDir', watcherCopy(sourcePath, target, opts, notify))
            .on('change', watcherCopy(sourcePath, target, opts, notify))
            .on('unlink', watcherDestroy(sourcePath, target, opts, notify))
            .on('unlinkDir', watcherDestroy(sourcePath, target, opts, notify))
            .on('error', watcherError(opts, notify));
    }


    function watcherCopy(source, target, opts, notify) {
        return function (f, stats) {
            console.log('copy');
            copy(f, path.join(target, path.relative(source, f)), notify);
        };
    }

    function watcherDestroy(source, target, opts, notify) {
        return function (f) {
            console.log('deleteExtra', path.join(target, path.relative(source, f)));
            deleteExtra(path.join(target, path.relative(source, f)), opts, notify);
        };
    }

    function watcherError(opts, notify) {
        return function (err) {
            notify('error', err);
        };
    }

    async function mirror(server, client, opts, notify, depth) {
        let source = server;
        const target = client;
        // const sourceIsDirectory = source.directory;
        source = source.path;

        let sourceStat;
        try {
            sourceStat = await fs.stat(source);
        } catch (e) {
            // Source not found: destroy target?
            if (map[target]) {
                // return deleteExtra(target, opts, notify);
                return fetchExtra(target, opts, notify);
            }
        }
        const sourceIsDirectory = sourceStat.isDirectory();
        const targetStat = map[target];
        if (!targetStat) {
            return copy(source, target, notify);
        }
        if (sourceIsDirectory && targetStat.directory) {
            if (depth === opts.depth) {
                notify('max-depth', source);
                return true;
            }
            const files = fs.readdirSync(source);
            let copied = true;
            for (const filename of files) {
                const result = await mirror({ path: path.join(source, filename), directory: sourceStat.isDirectory() }, path.join(target, filename), opts, notify, depth + 1);
                copied = copied && result;
                if (!result) {
                    console.log('break');
                    break;
                }
            }
            let deletedExtra = true;
            for (const filename of targetStat.files) {
                const exist = await fs.exists(path.join(source, filename));
                if (!exist) {
                    deletedExtra = await fetchExtra(path.join(target, filename), opts, notify);
                } else {
                    deletedExtra = true;
                }
            }
            return copied && deletedExtra;
        } else if ((!sourceIsDirectory && !targetStat.directory) || (sourceIsDirectory && targetStat.directory)) { // same type            
            // console.log(source, sourceStat.mtime.getTime() > targetStat.mtime, sourceStat.mtime.getTime(), targetStat.mtime);
            const sourceTime = sourceStat.mtime.getTime();
            // if (sourceTime > targetStat.mtime) {
            //     return copy(source, target, notify);
            // }
            if (sourceTime < targetStat.mtime) {
                return fetchExtra(target, opts, notify);
            }
            return true;
        } else if ((!sourceIsDirectory && targetStat.directory) || (sourceIsDirectory && !targetStat.directory)) { // different type
            // compare update-time before overwriting            
            // if (sourceStat.mtime.getTime() > targetStat.mtime) {
            return fetchExtra(target, opts, notify);
            // }
            return true;
        } else if (opts.delete) {
            // incompatible types: destroy target and copy
            return await destroy(target, notify) && copy(source, target, notify);
        } else if (sourceStat.isFile() && targetStat.directory) {
            // incompatible types
            notify('error', `Cannot copy file '${source}' to '${target}' as existing folder`);
            return false;
        } else if (sourceIsDirectory && !targetStat.directory) {
            // incompatible types
            notify('error', `Cannot copy folder '${source}' to '${target}' as existing file`);
            return false;
        }
        throw new Error('Unexpected case: WTF?');
    }
    async function fetchExtra(fileordir, opts, notify) {
        const list = await socket.emitp("fetch", fileordir);

        for (let i = 0; i < list.length; i++) {
            const file = list[i];
            const filepath = path.join(source.path, file.path);
            // const filepath = path.join(folderpath, file.filename);
            if (!file.directory) {
                try {
                    await fs.stat(source);
                } catch (e) {
                    await fs.remove(filepath);
                }
                await fs.outputFile(filepath, file.content);
            } else {
                await fs.remove(filepath);
                await fs.ensureDir(filepath);
            }
        }

        notify('fetch', fileordir);
        return true;
    }
    async function deleteExtra(fileordir, opts, notify) {
        socket.emit("delete", fileordir);
        await notify('delete', [fileordir]);
        return true;
    }

    async function copy(source, target, notify) {
        console.trace(1);
        await notify('copy', [source, target]);
        return true;
    }

    function destroy(fileordir, notify) {
        notify('remove', fileordir);
    }
};

