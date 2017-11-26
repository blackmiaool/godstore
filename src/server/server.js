const fs = require('fs-extra');
const fsinfo = require("../fsinfo");
const chalk = require('chalk');
const io = require('blacksocket.io/server')(23335, {
    path: '/test',
    serveClient: false,
});

const Path = require('path');
const sync = require('./sync-files');
const { islegalPath } = require('../common');

const targetFolder = Path.join(__dirname, '..', '..', 'target');
console.log('targetFolder', targetFolder);
function testPath(path) {
    return /\.(\/|$)/.test(path);
}

process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at:', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});
async function startSync(socket) {
    const list = await socket.emitp('get-file-list');
    const map = {};
    list.forEach((li) => {
        map[li.path] = li;
        delete li.path;
    });


    sync({ path: targetFolder, directory: true }, map, socket, {
        watch: false,
        delete: true,
    }, onMessage);

    async function copy(data) {
        const stat = await fs.stat(data[0]);
        if (stat.isDirectory()) {
            const list = await fsinfo(data[0]);
            for (let i = 0; i < list.length; i++) {
                const li = list[i];
                const pathThis = Path.join(data[0], li.path);
                const targetPath = Path.join(data[1], li.path);
                if (li.directory) {
                    await socket.emitp('copyDir', {
                        path: targetPath
                    });
                } else {
                    const buf = await fs.readFile(pathThis);
                    await socket.emitp('copy', {
                        path: targetPath,
                        data: buf.buffer
                    });
                }
            }
        } else {
            const buf = await fs.readFile(data[0]);

            await socket.emitp('copy', {
                path: data[1],
                data: buf.buffer
            });
        }
    }
    async function onMessage(event, data) {
        const root = process.cwd();
        switch (event) {
            case 'error':
                console.error(chalk.bold.red(data.message || data));
                process.exit(data.code || 2);
                break;

            case 'copy':
                await copy(data);
                console.log('%s %s to %s', chalk.bold('COPY'), chalk.yellow(Path.relative(root, data[0])), chalk.yellow(data[1]));
                break;
            case 'remove':
                console.log('%s %s', chalk.bold('DELETE'), chalk.yellow(data));
                break;

            case 'watch':
                console.log('%s %s', chalk.bold('WATCHING'), chalk.yellow(Path.relative(root, data)));
                break;
            default:
                console.log('event', event, data);
        }
    }
}

io.on('connection', async (socket) => {
    console.log('socket connection');
    console.log('synchronizing');
    socket.on('sync-changes', (queue) => {
        console.log(queue);
        queue.forEach(({ event, path }) => {
            if (!islegalPath(path)) {
                console.log('illegal path', path);
                return;
            }
            const absPath = Path.join(targetFolder, path);
            switch (event) {
                case 'deleteDir':
                    fs.remove(absPath);
                    break;
                case 'delete':
                    fs.remove(absPath);
                    break;
                case 'addDir':
                    socket.emit("fetch", path, (list) => {
                        if (!list) {
                            return;
                        }
                        console.log(list);
                        list.forEach((file) => {
                            if (file.directory && !file.files.length) {
                                fs.ensureDir(absPath);
                            }
                            if (!file.directory) {
                                const filepath = absPath;
                                fs.outputFile(filepath, file.content);
                            }
                        });
                    });
                    break;
                case 'change':
                case 'add':
                    socket.emit("fetch", path, (result) => {
                        fs.outputFile(absPath, result[0].content);
                    });
                    break;
                default:
                    console.log('unrecognized event', event);
                    break;
            }
        });
    });
    await socket.emitp('start-sync');
    await startSync(socket);
    await socket.emitp('end-sync');
    console.log('synchronize finished');
});
process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at:', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});
