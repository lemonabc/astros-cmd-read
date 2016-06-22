'use strict';

var nodeUrl = require('url');
var nodePath = require('path');
var nodeFs = require('fs');
var nodeUtil = require('util');

var util = require('lang-utils');

module.exports = new astro.Middleware({
    fileType: 'js'
}, function(asset, next) {
    if(!asset.data){
        asset.data = asset.read();
    }
    if(asset.data &&  asset.modType != 'static'){
    asset.data = 'define(' + (asset.modType == 'jsCom'?JSON.stringify(asset.name)+ ', ':'')
        +'function(require, module, exports){\n' + asset.data + '\n});';
    }
    next(asset);
});

let refer_cache = {};
// 获取代码里的引用关系
function getReference(asset) {
    let cache = refer_cache[asset.filePath] || {};
    if(cache.mtime !== asset.mtime){
        let ret = [];
        (asset.data||'').replace(/require\s*?\(\s*(['"])(\S+)\1\s*\);?/g, 
            function(a, b, reqjs) {
            reqjs.split(',').forEach(function(item){
                item = item.replace(/^\s|\s$/,'');
                if(item){
                    ret.push(item)
                }
            });

        });
        cache.data = ret;
        cache.mtime = asset.mtime;

        refer_cache[asset.filePath] = cache;
    }
    return cache.data;
}

function getJsDependent(asset, callback) {
    let errorMsg = '';
    let jsLibs = getReference(asset);
    //处理依赖
    if (jsLibs.length > 0) {
        // 处理JS组件依赖关系
        let process = (function*() {
            let i = 0;
            while (jsLibs[i]) {
                if (i > 1000) {
                    errorMsg += '/* ***** ' + '\n依赖套嵌超过一千次，可能出现死循环\n' + jsLibs.join(',') + '** */\n';
                    console.error('n依赖套嵌超过一千次，可能出现死循环, asset.name:%s, asset.components', asset.name, asset.components ? asset.components.join(',') : 'null');
                    console.info(jsLibs.join(','));
                    break;
                }
                new astro.Asset({
                    ancestor: asset,
                    modType: 'jsCom',
                    fileType: 'js',
                    name: jsLibs[i],
                    project: asset.project
                }).getContent(function(asset) {
                    if (!asset.data) {
                        errorMsg += '/* cmd-read:' + asset.info+ ' ' + jsLibs[i] + ' is miss or empty */\n';
                    } else {
                        jsLibs = jsLibs.concat(getReference(asset));
                    }
                    i++;
                    process.next();
                });
                yield;
            }
            done();
        }());
        process.next();
    } else {
        done();
    }
    function done() {
        callback(errorMsg, util.dequeueArray(jsLibs).reverse());
    }
}