// Usage: node tools/configure-whisper-cpp.cjs <upstream-v1.8.2-source-directory>
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert(process.argv[2],'Provide the whisper.cpp v1.8.2 source directory');
const source=path.resolve(process.argv[2]),file=path.join(source,'CMakeLists.txt');
let text=fs.readFileSync(file,'utf8');
assert(text.includes('project("whisper.cpp" VERSION 1.8.2)'),'Expected whisper.cpp v1.8.2');
text=text.replace('set(CMAKE_C_FLAGS   "${CMAKE_C_FLAGS}   -pthread")','set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -msimd128")').replace('set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -pthread")','set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -msimd128")');
if(!text.includes('add_executable(sayit'))text+=`\n# Say it browser Worker bridge: single-threaded, no SharedArrayBuffer.\nadd_executable(sayit "${path.join(__dirname,'whisper-cpp-bridge.cpp').replaceAll('\\','/')}")\ntarget_link_libraries(sayit PRIVATE whisper)\nset_target_properties(sayit PROPERTIES SUFFIX ".mjs" OUTPUT_NAME "whisper-cpp")\ntarget_link_options(sayit PRIVATE\n  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sEXPORT_NAME=createWhisperCpp"\n  "-sENVIRONMENT=worker" "-sFILESYSTEM=0" "-sDYNAMIC_EXECUTION=0"\n  "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=134217728" "-sMAXIMUM_MEMORY=1073741824"\n  "-sSTACK_SIZE=8388608" "-sEXPORTED_FUNCTIONS=['_malloc','_free']"\n  "-sEXPORTED_RUNTIME_METHODS=['ccall','UTF8ToString']"\n)\n`;
fs.writeFileSync(file,text);
console.log('Configured single-thread SIMD bridge. Run emcmake cmake as documented in README.');
