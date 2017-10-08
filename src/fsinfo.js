const path = require('path');
const fs = require('fs-extra');

module.exports = async function (targetPath, opt = {}) {
    const rootPath = targetPath;
    const list = [];
    const stat = await fs.stat(targetPath);
    const isDirectory = stat.isDirectory();
    function handler(info) {
        list.push(info);
    }
    if (isDirectory) {
        const files = await fs.readdir(targetPath);
        handler({
            path: '/',
            filename: '/',
            directory: true,
            files,
        });
        await traverseFolder({ path: '', files }, targetPath, handler, rootPath, opt);
    } else {
        handler({
            path: '/',
            filename: path.parse(targetPath).base,
            directory: false,
        });
    }
    return list;
};
async function traverseFolder(folder, targetPath, handler, rootPath, opt) {
    const folders = [];
    const finalPath = path.join(targetPath, folder.path);

    const files = await fs.readdir(finalPath);
    if (!files) {
        return;
    }
    await Promise.all(files.map(async (filename) => {
        const filePath = path.join(folder.path, filename);
        const fullPath = path.join(targetPath, filePath);

        const stat = await fs.stat(fullPath);
        const isDirectory = stat.isDirectory();

        const params = {
            path: `/${path.relative(rootPath, fullPath)}`,
            filename,
            directory: isDirectory,
            mtime: stat.mtime.getTime(),
        };
        if (opt.read && !isDirectory) {
            const content = await fs.readFile(fullPath);
            params.content = content.buffer;
        }

        if (isDirectory) {
            const files = await fs.readdir(fullPath);
            params.files = files;
            folders.push({ path: filePath, files });
        }
        handler && handler(params);
    }));
    await Promise.all(folders.map(foldername =>
        traverseFolder(foldername, targetPath, handler, rootPath, opt)
    ));
}
