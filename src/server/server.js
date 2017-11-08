const fs = require('fs-extra');
const fsinfo = require("../fsinfo");
const chalk = require('chalk');
const io = require('blacksocket.io/server')(23335, {
    path: '/test',
    serveClient: false,
});

const Path = require('path');
const sync = require('../../node-sync-files');

const targetFolder = Path.join(__dirname, '..', '..', 'target');
console.log('targetFolder', targetFolder);
function testPath(path) {
    return /\.(\/|$)/.test(path);
}
const promise = true;
process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at:', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});
async function startSync(socket) {
    const list = await socket.emitp('get-file-list');
    console.log(list)
    const map = {};
    list.forEach((li) => {
        map[li.path] = li;
        delete li.path;
    });


    sync(targetFolder, map, socket, {
        watch: true,
        delete: true,
    }, onMessage);

    async function copy(data) {
        const stat = await fs.stat(data[0]);
        if (stat.isDirectory()) {
            const list = await fsinfo(data[0]);
            for (let i = 0; i < list.length; i++) {
                const li = list[i];
                if (li.directory) {
                    continue;
                }
                const pathThis = Path.join(data[0], li.path);
                const targetPath = Path.join(data[1], li.path);
                const buf = await fs.readFile(pathThis);
                await socket.emitp('copy', {
                    path: targetPath,
                    data: buf.buffer
                });
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
            switch (event) {
                case 'addDir':
                    socket.emit("fetch", path, (list) => {
                        if (!list) {
                            return;
                        }
                        console.log(list);
                        list.forEach((file) => {
                            if (!file.directory) {
                                const filepath = Path.join(targetFolder, path);
                                fs.outputFile(filepath, file.content);
                            }
                        });
                    });
                    break;
                default:
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
