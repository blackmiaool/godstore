
const Path = require('path');
const fs = require('fs-extra');

const fsinfo = require("../fsinfo");
const EventEmitter = require('events');
const rimraf = require('rimraf');
const common = require('../common');

const io = require('blacksocket.io/client');
const chokidar = require('chokidar');

const targetFolder = Path.join(__dirname, '..', '..', 'source');
process.on('unhandledRejection', (reason, p) => {
    console.log('Unhandled Rejection at:', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


setTimeout(() => {
    const socket = io(':23335/test');
    socket.on('first-connect', () => {
        console.log('connected');

        // startSync(socket);
        socket.on('get-file-list', () => fsinfo(targetFolder));
    });
    socket.on('delete', (params) => {
        console.log('ondelete', params);
        if (common.islegalPath(params)) {
            console.warn('invalid path', params);
            return;
        }
        const target = Path.join(targetFolder, params);
        console.log('delete target', target);
        rimraf(target, () => { });
    });
    socket.on('copy', async ({ path, data }, cb) => {
        if (common.islegalPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        await fs.ensureDir(Path.parse(path).dir);
        await fs.writeFile(path, data);
        cb();
    });
    socket.on('fetch', async (path, cb) => {
        if (common.islegalPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        const list = await fsinfo(path, { read: true });
        list.forEach((file) => {
            file.path = Path.join(Path.relative(targetFolder, path));
        });
        console.log(list);
        cb(list);
    });
    const watch = new Watch({ targetFolder });
    watch.on('pour', (queue) => {
        console.log('pour', queue);
        socket.emit('sync-changes', queue);
    });
    socket.on('start-sync', (cb) => {
        rl.write('start synchronizing');
        cb();
        watch.pause();
    });

    socket.on('end-sync', (cb) => {
        readline.clearLine(rl);
        readline.cursorTo(rl, 0);
        console.log('synchronization finished');
        cb();
        watch.start();
    });
}, 200);
class Watch extends EventEmitter {
    constructor({ targetFolder, delay = 300 }) {
        super();
        this.delay = delay;
        this.queue = [];
        this.timeout = 0;
        this.running = false;
        chokidar.watch(targetFolder, {
            persistent: true,
            ignoreInitial: true,
        })
            .on('ready', () => {
                console.log('ready to watch');
            })
            .on('add', (path) => {
                this.push({
                    event: 'add',
                    path
                });
                console.log('add', arguments);
            })
            .on('addDir', (path) => {
                this.push({
                    event: 'addDir',
                    path
                });
                console.log('adddir', arguments);
            })
            .on('change', (path) => {
                this.push({
                    event: 'change',
                    path
                });
                console.log('change', arguments);
            })
            .on('unlink', (path) => {
                this.push({
                    event: 'delete',
                    path
                });
                console.log('unlink', arguments);
            })
            .on('unlinkDir', (path) => {
                this.push({
                    event: 'deleteDir',
                    path
                });
                console.log('unlinkdir', arguments);
            })
            .on('error', function () {
                console.log('error', arguments);
            });
    }
    end() {
        this.running = false;
    }
    pause() {
        console.log('pause');
        this.running = false;
    }
    start() {
        console.log('start');
        this.running = true;
    }
    static filterQueue(queue) {
        console.log(queue);
        queue.forEach((item) => {
            item.path = Path.relative(targetFolder, item.path);
        });
        const addPathMap = {};
        queue = queue.filter(({ event, path }) => {
            if (event === 'add' || event === 'addDir') {
                addPathMap[path] = event;
                return false;
            } else if (event === 'delete' || event === 'deleteDir') {
                if (addPathMap[path]) {
                    delete addPathMap[path];
                    return false;
                }
            }
            return true;
        });
        const searchedFolderMap = {};
        Object.keys(addPathMap).sort((a, b) => a.length - b.length).forEach((path) => {
            console.log('p', path)
            const folders = path.split(Path.sep);
            while (folders.length) {
                folders.pop();
                const folderPath = Path.join(...folders);
                console.log('folderPath', folderPath);
                if (addPathMap[folderPath]) {
                    console.log('del')
                    delete addPathMap[path];
                    break;
                } else if (searchedFolderMap[folderPath]) {
                    break;
                } else {
                    searchedFolderMap[folderPath] = true;
                }
            }
        });

        for (const i in addPathMap) {
            queue.push({ event: addPathMap[i], path: i });
        }

        return queue;
    }
    push(event) {
        if (!this.running) {
            return;
        }
        this.queue.push(event);
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            this.timeout = 0;
            if (!this.queue.length) {
                return;
            }
            this.queue = Watch.filterQueue(this.queue);
            this.emit('pour', this.queue);
        }, this.delay);
    }
}


// function startSync(socket) {
//     socket.emit('get-file-list', {}, (list) => {
//         const map = {};
//         list.forEach((li) => {
//             map[li.path] = li;
//             delete li.path;
//         });
//         // console.log(map);

//         sync(Path.join(__dirname, targetFolder), map, socket, {
//             watch: true,
//             delete: true,
//         }, onMessage);
//     });
// }
// const log = console.log;
// let i = 0; // dots counter
// const readline = require('readline');
// const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout
// });
// rl.question('What is your favorite food? ', (answer) => {
//     console.log(`Oh, so your favorite food is ${answer}`);
// });
// setTimeout(() => {
//     process.stdout.write(`Waiting`);
//     setInterval(() => {
//         readline.cursorTo(rl, 7);
//         readline.clearLine(rl, 1);
//         // readline.cursorTo(rl, 0); // clear current text
//         // process.stdout.cursorTo(0); // move cursor to beginning of line
//         i = (i + 1) % 4;
//         const dots = ".".repeat(i);
//         process.stdout.write(`${dots}`); // write text
//     }, 300);
// }, 100);


// // Combine styled and normal strings
// log(chalk.blue('Hello2') + 'World' + chalk.red('!'));

// // Compose multiple styles using the chainable API
// log(chalk.blue.bgRed.bold('Hello world!'));

// // Pass in multiple arguments
// log(chalk.blue('Hello', 'World!', 'Foo', 'bar', 'biz', 'baz'));

// // Nest styles
// log(chalk.red('Hello', chalk.underline.bgBlue('world') + '!'));

// // Nest styles of the same type even (color, underline, background)
// log(chalk.green(
//     'I am a green line ' +
//     chalk.blue.underline.bold('with a blue substring') +
//     ' that becomes green again!'
// ));

// // ES2015 template literal
// log(`
// CPU: ${chalk.red('90%')}
// RAM: ${chalk.green('40%')}
// DISK: ${chalk.yellow('70%')}
// `);

// // ES2015 tagged template literal
// log(chalk`
// CPU: {red ${50}%}
// RAM: {green ${20 / 10 * 100}%}
// DISK: {rgb(255,131,0) ${ 100}%}
// `);

// // Use RGB colors in terminal emulators that support it.
// log(chalk.keyword('orange')('Yay for orange colored text!'));
// log(chalk.rgb(123, 45, 67).underline('Underlined reddish color'));
// log(chalk.hex('#DEADED').bold('Bold gray!'));
