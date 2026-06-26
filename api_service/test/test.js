async function fetchChunk() {
  const res = await fetch("https://vtube.kvan9266.workers.dev/videos/65/a2/04144f26-7861-44d6-9c9e-5454217682c4/dash/manifest.mpd?exp=1777267003921&sig=6a60abcb63ecfe1c775b3b5c8c05d482a8af9faff542e130559061d67992b22e")
  const buffer = await res.arrayBuffer();

  console.log("Chunk size:", buffer.byteLength);
  console.log(JSON.stringify(buffer));
}

fetchChunk();