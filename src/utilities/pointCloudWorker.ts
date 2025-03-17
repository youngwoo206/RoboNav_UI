// pointCloudWorker.ts
self.onmessage = (e) => {
    const { message, decimationFactor, frustumData } = e.data;
    
    // Process the point cloud data
    const result = processPointCloud(message, decimationFactor, frustumData);
    
    // Send the processed data back to the main thread
    // Use transferable objects for better performance
    self.postMessage(
      { 
        positions: result.positions, 
        colors: result.colors, 
        validPoints: result.validPoints, 
        totalPoints: result.totalPoints 
        },
        //@ts-expect-error
      [result.positions.buffer, result.colors.buffer]
    );
  };
  
  function processPointCloud(message: any, decimationFactor: number, frustumData?: any) {
    const { height, width, point_step, data, fields } = message;
    const totalPoints = height * width;
    
    // Increase decimation factor for large point clouds
    let currentDecimation = decimationFactor;
    if (totalPoints > 100000) currentDecimation = decimationFactor * 2;
    if (totalPoints > 200000) currentDecimation = decimationFactor * 4;
  
    // Find offsets for x, y, z in the binary structure
    const fieldOffsets: Record<string, number> = {};
    if (fields) {
      for (let i = 0; i < fields.length; i++) {
        fieldOffsets[fields[i].name] = fields[i].offset;
      }
    }
  
    const xOffset = fieldOffsets.x ?? 0;
    const yOffset = fieldOffsets.y ?? 4;
    const zOffset = fieldOffsets.z ?? 8;
  
    // Pre-allocate maximum possible size arrays
    const positions = new Float32Array(Math.ceil(totalPoints / currentDecimation) * 3);
    const colors = new Float32Array(Math.ceil(totalPoints / currentDecimation) * 3);
    
    let validPoints = 0;
  
    // Process points with decimation
    for (let i = 0; i < totalPoints; i += currentDecimation) {
      const baseOffset = i * point_step;
      if (baseOffset + 12 > data.length) break; // Safety check
  
      // Extract XYZ coordinates
      const x = new Float32Array(
        new Uint8Array([
          data[baseOffset + xOffset],
          data[baseOffset + xOffset + 1],
          data[baseOffset + xOffset + 2],
          data[baseOffset + xOffset + 3],
        ]).buffer
      )[0];
  
      const y = new Float32Array(
        new Uint8Array([
          data[baseOffset + yOffset],
          data[baseOffset + yOffset + 1],
          data[baseOffset + yOffset + 2],
          data[baseOffset + yOffset + 3],
        ]).buffer
      )[0];
  
      const z = new Float32Array(
        new Uint8Array([
          data[baseOffset + zOffset],
          data[baseOffset + zOffset + 1],
          data[baseOffset + zOffset + 2],
          data[baseOffset + zOffset + 3],
        ]).buffer
      )[0];
  
      // Skip invalid points
      if (isNaN(x) || isNaN(y) || isNaN(z) || !isFinite(x) || !isFinite(y) || !isFinite(z)) {
        continue;
      }
  
      // Convert to Three.js coordinates
      const threeX = x;
      const threeY = z;
      const threeZ = -y;
  
      // Add point to buffers
      positions[validPoints * 3] = threeX;
      positions[validPoints * 3 + 1] = threeY;
      positions[validPoints * 3 + 2] = threeZ;
  
      // Color mapping based on height
      const heightValue = z;
      let r, g, b;
  
      if (heightValue < -0.5) {
        r = 0; g = 0.1; b = 0.8;
      } else if (heightValue < 0) {
        r = 0; g = 0.6; b = 0.8;
      } else if (heightValue < 1) {
        r = 0.1; g = 0.8; b = 0.1;
      } else if (heightValue < 2) {
        r = 0.8; g = 0.8; b = 0.1;
      } else {
        r = 0.8; g = 0.1; b = 0.1;
      }
  
      colors[validPoints * 3] = r;
      colors[validPoints * 3 + 1] = g;
      colors[validPoints * 3 + 2] = b;
  
      validPoints++;
    }
  
    // Return only the used portions of the arrays
    return {
      positions: positions.slice(0, validPoints * 3),
      colors: colors.slice(0, validPoints * 3),
      validPoints,
      totalPoints
    };
  }