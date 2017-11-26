
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
    // const socket = io('ws://192.168.199.194:23335/test');
    const socket = io(':23335/test');
    socket.on('first-connect', () => {
        console.log('connected');

        // startSync(socket);
        socket.on('get-file-list', () => fsinfo(targetFolder));
    });
    socket.on('delete', (params) => {
        console.log('ondelete', params);
        if (!common.islegalPath(params)) {
            console.warn('invalid path', params);
            return;
        }
        const target = Path.join(targetFolder, params);
        console.log('delete target', target);
        rimraf(target, () => { });
    });
    socket.on('copy', async ({ path, data }, cb) => {
        if (!common.islegalPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        await fs.ensureDir(Path.parse(path).dir);
        await fs.writeFile(path, data);
        cb();
    });
    socket.on('copyDir', async ({ path }, cb) => {
        console.log('copydir');
        if (!common.islegalPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        await fs.ensureDir(path);
        cb();
    });
    socket.on('fetch', async (path, cb) => {
        console.log('on fetch', path);
        if (!common.islegalPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        const list = await fsinfo(path, { read: true });
        list.forEach((file) => {
            // console.log('original file.path', file.path);
            file.path = Path.join(Path.relative(targetFolder, path), file.path);
        });
        console.log('cb list', list);
        cb(list);
    });
    const watch = new Watch({ targetFolder });
    watch.on('pour', (queue) => {
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
        const args = arguments;
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
            .on('add', (path, name) => {
                this.push({
                    event: 'add',
                    path
                });
                console.log('add');
            })
            .on('addDir', (path) => {
                this.push({
                    event: 'addDir',
                    path
                });
                console.log('adddir');
            })
            .on('change', (path) => {
                this.push({
                    event: 'change',
                    path
                });
                console.log('change');
            })
            .on('unlink', (path) => {
                this.push({
                    event: 'delete',
                    path
                });
                console.log('unlink', path);
            })
            .on('unlinkDir', (path) => {
                this.push({
                    event: 'deleteDir',
                    path
                });
                console.log('unlinkdir');
            })
            .on('error', () => {
                console.log('error');
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
        queue.forEach((item) => {
            item.path = Path.relative(targetFolder, item.path);
        });
        const addPathMap = {};
        queue = queue.filter(({ event, path }) => {
            if (event === 'add') {
                addPathMap[path] = event;
                return false;
            } else if (event === 'delete') {
                if (addPathMap[path]) {
                    delete addPathMap[path];
                    return false;
                }
            }
            return true;
        });
        const searchedFolderMap = {};
        Object.keys(addPathMap)
            .sort((a, b) => a.length - b.length)
            .forEach((path) => {
                console.log('p', path);
                const folders = path.split(Path.sep);
                console.log('folders', folders);
                while (folders.length) {
                    folders.pop();
                    const folderPath = Path.join(...folders);
                    console.log('folderPath', folderPath);
                    if (addPathMap[folderPath]) {
                        console.log('del');
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
            this.queue.length = 0;
        }, this.delay);
    }
}

