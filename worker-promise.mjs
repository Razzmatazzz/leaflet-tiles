import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';

export const workerEvents = new EventEmitter();
let activeWorkers = 0;

class WorkerPromise {
    constructor(workerFile) {
        this.promise = new Promise((resolve, reject) => {
            this.worker = new Worker(`./${workerFile}`);
            this.worker.on('message', (data) => {
                //console.log(data);
                if (data.message === 'complete') {
                    activeWorkers--;
                    workerEvents.emit('workerEnded', activeWorkers);
                    delete this.worker;
                    resolve(data);
                }
            });
            this.worker.on('error', (msg) => {
                activeWorkers--;
                workerEvents.emit('workerEnded', activeWorkers);
                delete this.worker;
                reject(msg);
            });
        });
    }

    start(options) {
        activeWorkers++;
        this.worker.postMessage(options);
        return this.promise;
    }
}

export const activeWorkerCount = () => {
    return activeWorkers;
};

export default WorkerPromise;
