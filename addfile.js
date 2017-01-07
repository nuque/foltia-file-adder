#! /usr/bin/env node

let co = require('co');
let thunkify = require('thunkify');
let fs = require('fs');
let pg = require('co-pg')(require('pg'));

let readDir = thunkify(fs.readdir);

let connectionString = 'postgres://foltia:@localhost/foltia';

co(function*() {
    let localizedFolders = (yield readDir('.')).filter((folder) => {
        return fs.statSync(folder).isDirectory() && /.*\.localized$/.test(folder);//フォルダtid.localized
    });
    let client = new pg.Client(connectionString);
    yield client.connectPromise();
    for (const folder of localizedFolders) {
        let tid = folder.split('.')[0];
        let mp4FolderPath = './' + folder + '/mp4/';
        let mp4Files =  (yield readDir(mp4FolderPath)).filter((file) => {
            return fs.statSync(mp4FolderPath + file).isFile() && /.*\.MP4$/.test(file);//ファイル.MP4
        });

        for (const mp4 of mp4Files) {
            if(tid === '-1'){
                console.log(mp4);
                //tid -1はキーワード録画
                continue;
            }

            if(tid === '0'){
                console.log(mp4);
                //tid 0はEPG録画
                continue;
            }
            //MHD-tid-話数-YYYYMMDD-hhmm.MP4 (YYYYMMDD-hhmmは放送日時)
            let fileNameSplited = mp4.split(/(?=\.[^.]+$)/)[0].split('-');
            let filequality = fileNameSplited[0];
            let countno = fileNameSplited[2];
            let date = fileNameSplited[3];
            let time = fileNameSplited[4];

            if(filequality !== 'MHD'){
                //MHDのみ、低画質はテーブルが違う
                continue;
            }
            //foltia_hdmp4filesに登録
            let insertHdmp4fileQuery = 'insert into foltia_hdmp4files(tid, hdmp4filename) select \'' + tid + '\', \'' + mp4 + '\' where not exists (select hdmp4filename from foltia_hdmp4files where hdmp4filename = \''+ mp4 +'\');';
            yield client.queryPromise(insertHdmp4fileQuery);

            //foltia_subtitleを更新
            let countnoquery = countno ? 'and countno=\'' + countno + '\'': 'and countno is null';
            let updateSubtitle = 'update foltia_subtitle set mp4hd=\'' + mp4 + '\', filestatus=\'200\''
                +' where pid = (select min(pid) from foltia_subtitle where tid=\'' + tid + '\' ' + countnoquery + ' and cast(startdatetime as varchar(12)) like \'' + date + time + '%\' );';
            yield client.queryPromise(updateSubtitle);
        }
    }
    client.end();
}).catch(console.error)
