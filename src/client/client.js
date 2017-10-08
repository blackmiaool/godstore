const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');

const fsinfo = require("../fsinfo");
const sync = require('../../node-sync-files');


const root = process.cwd();

const io = require('blacksocket.io/client');

const socket = io(':23334/test');
socket.on('first-connect', () => {
    console.log('connected');

    startSync(socket);
});


async function copy(data) {
    const stat = await fs.stat(data[0]);
    if (stat.isDirectory()) {
        const list = await fsinfo(data[0]);
        for (let i = 0; i < list.length; i++) {
            const li = list[i];
            if (li.directory) {
                continue;
            }
            const pathThis = path.join(data[0], li.path.slice(1));
            const targetPath = path.join(data[1], li.path.slice(1));
            const buf = await fs.readFile(pathThis);
            console.log('copystart');
            await socket.emit('copy', {
                path: targetPath,
                data: buf.buffer
            }, true);
            console.log('copydone');
        }
    } else {
        const buf = await fs.readFile(data[0]);

        await socket.emit('copy', {
            path: data[1].slice(1),
            data: buf.buffer
        }, true);
    }
}
async function onMessage(event, data) {
    switch (event) {
        case 'error':
            console.error(chalk.bold.red(data.message || data));
            process.exit(data.code || 2);
            break;

        case 'copy':
            await copy(data);
            console.log('%s %s to %s', chalk.bold('COPY'), chalk.yellow(path.relative(root, data[0])), chalk.yellow(data[1]));
            break;
        case 'remove':
            console.log('%s %s', chalk.bold('DELETE'), chalk.yellow(data));
            break;

        case 'watch':
            console.log('%s %s', chalk.bold('WATCHING'), chalk.yellow(path.relative(root, data)));
            break;

        case 'max-depth':
            console.log('%s: %s too deep', chalk.bold.dim('MAX-DEPTH'), chalk.yellow(path.relative(root, data)));
            break;

        case 'no-delete':
            console.log('%s: %s extraneous but not deleted (use %s)', chalk.bold.dim('IGNORED'), chalk.yellow(path.relative(root, data)), chalk.blue('--delete'));
            break;
        case 'fetch':
            console.log('fetch', data);
            break;
        default:
    }
}
function startSync(socket) {
    socket.emit('get-file-list', {}, (list) => {
        const map = {};
        list.forEach((li) => {
            map[li.path] = li;
            delete li.path;
        });
        // console.log(map);

        sync(path.join(__dirname, '../../source'), map, socket, {
            watch: true,
            delete: true,
        }, onMessage);
    });
}
