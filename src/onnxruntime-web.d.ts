declare module 'onnxruntime-web' {
    export class InferenceSession {
      static create(
        uri: string | ArrayBuffer | Uint8Array,
        options?: InferenceSession.SessionOptions
      ): Promise<InferenceSession>;
      
      run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
      // Add other methods you need
    }
    
    export namespace InferenceSession {
      interface SessionOptions {
        executionProviders?: string[];
        graphOptimizationLevel?: string;
        // Add other options you need
      }
    }
    
    export class Tensor {
      constructor(
        type: string,
        data: Float32Array | Int32Array | Int8Array | Uint8Array | any,
        dims: number[]
      );
      
      // Add properties and methods you need
      data: any;
      dims: number[];
      type: string;
    }
    
    // Add any other types you need
  }