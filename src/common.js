function islegalPath(pathname) {
    return /\.(\/|$)/.test(pathname);
}
module.exports = {
    islegalPath
};

