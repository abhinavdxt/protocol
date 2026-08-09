const fs = require('fs');
const dump = fs.readFileSync('dump.json', 'utf8');
const classRe = /{"date":"(\d{4}-\d{2}-\d{2})","code":"([^"]+)","section":"[^"]+","slot":"([^"]+)"[^{}]*}/g;
let m;
let count = 0;
while ((m = classRe.exec(dump)) !== null) {
    if (count < 5) console.log(m[0]);
    count++;
}
console.log("Total classes found:", count);
