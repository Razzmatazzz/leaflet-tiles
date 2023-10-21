import { Worker } from 'worker_threads';

class WorkerPromise {
    constructor(workerFile) {
        this.promise = new Promise((resolve, reject) => {
            this.worker = new Worker(`./${workerFile}`);
            this.worker.on('message', (data) => {
                //console.log(data);
                if (data.message === 'complete') {
                    resolve(data);
                }
            });
            this.worker.on('error', (msg) => {
                reject(msg);
            });
        });
    }

    start(options) {
        this.worker.postMessage(options);
        return this.promise;
    }
}

export default WorkerPromise;
