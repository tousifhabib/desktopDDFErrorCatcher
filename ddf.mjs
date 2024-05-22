import xlsx from 'node-xlsx'
import yaml from 'js-yaml'
import {readFileSync} from 'fs'
import * as path from 'path'

class Table {
    constructor(path) {
        const text = readFileSync(path, 'utf8').toString();
        const json = JSON.parse(text);
        this.sheet = json.sheet;
        this.name = json.table;
        this.header = json.header;
        this.rows = json.rows;
        this.data = json.rows.map(row => {
            return Object.fromEntries(row.map((v, i) => [json.header[i], v]));
        }).filter(r => r);
    }
}

class XLSX {
    constructor(filePath) {
        if (!path.isAbsolute(filePath)) {
            filePath = path.join('data', filePath);
        }
        this.sheets = xlsx.parse(filePath);
        this.sheets.forEach((s, i) => {
            s.rows = [...s.data];
            const header = s.rows.shift();
            if (!header) return;
            s.header = header;
            s.rows = s.rows.map(row => {
                return Object.fromEntries(row.map((v, i) => [header[i], v]).filter(item => typeof item !== 'undefined'));
            }).filter(r => r);
            this[i] = this[s.name] = s;
        });
    }
}

class DDF extends XLSX {
    constructor(path) {
        super(path);
        this.sheets.forEach((s, i) => {
            s.cases = [];
            try {
                if (!s.header.includes('FieldType')) throw 'no FieldType column found';
                const maxDepth = s.header.filter(h => h.match(/^Field\d+$/)).length;
                if (maxDepth == 0) throw 'no Field1 column found';
                const emptyValues = ['null', 'not exist', '{}', '[]', '""'];
                s.cases = s.header.filter(h => h != 'Input' && h != 'FieldType' && h != 'FieldOutput' && !h.match(/^Field\d+$/)).map(h => {
                    const levels = r => {
                        const levels = [];
                        for (let i = 1; i <= maxDepth; ++i) {
                            let l = r[`Field${i}`];
                            if (l !== undefined) {
                                l = l.toString().trim();
                                if (l.length == 0) l = undefined;
                            }
                            levels.push(l);
                        }
                        for (let j = levels.length - 1; j >= 0 && levels[j] === undefined; --j) {
                            levels.pop();
                        }
                        return levels;
                    };
                    const c = {
                        title: h
                    };
                    const lines = ['---'];
                    const linesLV = [];
                    for (let i = 0; i < s.rows.length; ++i) {
                        const r = s.rows[i];
                        const normalize = v => {
                            if (v !== undefined) {
                                v = v.toString().trim();
                                if (v.length == 0) v = undefined;
                            }
                            return v;
                        };
                        let type = normalize(r.FieldType);
                        if (type !== undefined) type = type.toLowerCase();
                        const typeMap = { list: 'seq', string: 'str', date: 'str', datetime: 'str', integer: 'int', number: 'int', boolean: 'bool', short: 'int' };
                        if (type in typeMap) type = typeMap[type];
                        else if (type !== undefined && !['map', 'seq', 'str', 'null', 'bool', 'int', 'float'].includes(type)) {
                            throw `row ${i + 2}: unsupported type: "${type}"`;
                        }
                        let value = normalize(r[h]);
                        if (value === 'not exist') type = 'str';
                        if (value !== undefined && ['int', 'float'].includes(type)) value = 1 * value;
                        if (type === undefined && value === undefined) value = '';
                        if (r.Input !== undefined) {
                            if (value !== undefined) c[r.Input] = value;
                            continue;
                        }
                        const lv = levels(r);
                        if (lv.length == 0) continue;
                        const prevLineLv = linesLV[linesLV.length - 1];
                        const prevLine = lines[lines.length - 1];
                        if ((prevLineLv < lv.length || (prevLineLv == lv.length && lv[lv.length - 1] === '-')) && emptyValues.some(type => prevLine.endsWith(type))) {
                            continue;
                        }
                        linesLV.push(lv.length);
                        let key = lv.pop();
                        if (key !== '-') key += ':';
                        let line = lv.map(l => {
                            if (l === '-') return l;
                            return l === undefined ? ' ' : `${l}:`;
                        }).join(' ');
                        if (line.length > 0) line += ' ';
                        const onull = r.FieldOutput === '○:null';
                        let required = r.FieldOutput !== undefined && (!onull || value === 'null');
                        if (emptyValues.some(type => value === type)) {
                            required = true;
                        }
                        if (value === 'null') {
                            type = null;
                        }
                        if (key !== '-') {
                            if (required) key = `required!${key}`;
                            if (onull && value === 'null') key = `null!${key}`;
                            else if (type !== undefined) key = `${type}!${key}`;
                        }
                        line += key;
                        if (required && type !== undefined && value === undefined) {
                            if (type == 'str') value = '""';
                            if (type == 'seq') value = '[]';
                            if (type == 'map') value = '{}';
                        }
                        if (value !== undefined) {
                            if (type !== undefined && value !== 'null') value = `!!${type} ${value}`;
                            line += ` ${value}`;
                        }
                        if (line.trimStart() === '-') continue;
                        lines.push(line);
                    }
                    lines.push('...');
                    const yml = lines.join('\n');
                    const obj = yaml.load(yml, { schema: yaml.JSON_SCHEMA });
                    const traverse = (obj, path = []) => {
                        let result = [];
                        for (const k in obj) {
                            if (!obj.hasOwnProperty(k)) continue;
                            const kk = k.split('!');
                            path.push(kk[kk.length - 1]);
                            const v = obj[k];
                            if (v === 'not exist') {
                                result.push(path.join('.'));
                                delete obj[k];
                            }
                            else if (typeof v == 'object' || Array.isArray(v)) {
                                result = result.concat(traverse(v, path));
                            }
                            path.pop();
                        }
                        return result;
                    };
                    c.shouldNotExist = traverse(obj);
                    c.data = JSON.parse(JSON.stringify(obj), (k, v) => {
                        const kk = k.split('!');
                        const required = kk.length >= 2 && kk[kk.length - 2] == 'required';
                        if (required) {
                            const type = kk.length == 3 ? kk[0] : (kk.length == 2 && kk[0] != 'required' ? kk[0] : undefined);
                            if (type !== undefined && v === null) {
                                if (type == 'str') v = '""';
                                if (type == 'seq') v = '[]';
                                if (type == 'map') v = '{}';
                            }
                            return v;
                        }
                        if (v === null || v === '') return undefined;
                        if (Array.isArray(v)) {
                            while (v.length > 0 && v[v.length - 1] === undefined) v.pop();
                            if (v.length == 0) return undefined;
                        }
                        if (typeof v == 'object' && Object.keys(v).length == 0) return undefined;
                        return v;
                    });
                    const transformKeys = (obj) => {
                        if (obj === null) return null;
                        if (Array.isArray(obj)) {
                            return obj.map(transformKeys);
                        }
                        if (typeof obj == 'object') {
                            return Object.fromEntries(
                                Object.entries(obj).map(([k, v]) => {
                                    const kk = k.split('!');
                                    return [kk[kk.length - 1], transformKeys(v)];
                                })
                            );
                        }
                        return obj;
                    };
                    c.data = transformKeys(c.data);
                    return c;
                });
                delete s.data;
                delete s.header;
                delete s.rows;
            } catch (error) {
                console.warn(`error when reading sheet #${i} "${s.name}":\n${error}`);
                s.error = error;
            }
        });
    }
}

export { Table, XLSX, DDF };
