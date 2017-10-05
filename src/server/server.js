const fs = require('fs');
const fsinfo = require("../fsinfo");
const mkdirp = require('mkdirp');

const io = require('blacksocket.io/server')(23334, {
    path: '/test',
    serveClient: false,
});
const Path = require('path');
const rimraf = require('rimraf');

const targetFolder = Path.join(__dirname, '..', '..', 'target');
console.log('targetFolder', targetFolder);
function testPath(path) {
    return /\.(\/|$)/.test(path);
}
io.on('connection', (socket) => {
    console.log('socket connection');
    socket.on('get-file-list', (params, cb) => {
        const list = [];
        fsinfo(targetFolder, (file) => {
            list.push(file);
        }).then(() => {
            cb(list);
        });
    });
    socket.on('delete', (params) => {
        if (testPath(params)) {
            console.warn('invalid path', params);
            return;
        }
        const target = Path.join(targetFolder, params);
        rimraf(target, () => { });
    });
    socket.on('copy', ({ path, data }, cb) => {
        if (testPath(path)) {
            console.warn('invalid path', path);
            return;
        }
        path = Path.join(targetFolder, path);
        mkdirp(Path.parse(path).dir, () => {
            fs.writeFile(path, data, (err) => {
                if (err) {
                    return console.log(err);
                }
                cb();
            });
        });
    });
});
