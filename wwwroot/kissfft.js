self.importScripts("a.out.js");

const scalar_size = 4;

function make_dataset(k_xdim, k_ydim, k_zdim, pd, t1, t2, t2s, na_mm, na_t1, na_ex_frac, na_t2s, na_t2f) {
    pd_buff = allocFromArray(pd);
    pd_ptr = pd_buff.byteOffset;
    t1_buff = allocFromArray(t1);
    t1_ptr = t1_buff.byteOffset;
    t2_buff = allocFromArray(t2);
    t2_ptr = t2_buff.byteOffset;
    t2s_buff = allocFromArray(t2s);
    t2s_ptr = t2s_buff.byteOffset;
    if(na_mm != undefined) {
        na_mm_buff = allocFromArray(na_mm);
        na_mm_ptr = na_mm_buff.byteOffset;
        na_t1_buff = allocFromArray(na_t1);
        na_t1_ptr = na_t1_buff.byteOffset;
        na_ex_frac_buff = allocFromArray(na_ex_frac);
        na_ex_frac_ptr = na_ex_frac_buff.byteOffset;
        na_t2s_buff = allocFromArray(na_t2s);
        na_t2s_ptr = na_t2s_buff.byteOffset;
        na_t2f_buff = allocFromArray(na_t2f);
        na_t2f_ptr = na_t2f_buff.byteOffset;
    } else {
        na_mm_ptr = 0;
        na_t1_ptr = 0;
        na_ex_frac_ptr = 0;
        na_t2s_ptr = 0;
        na_t2f_ptr = 0;
    }
    dataset = _make_dataset(k_xdim,k_ydim,k_zdim,pd_ptr, t1_ptr, t2_ptr, t2s_ptr, na_mm_ptr, na_t1_ptr, na_ex_frac_ptr, na_t2s_ptr, na_t2f_ptr);
    return dataset;
}

function free_dataset(dataset) {
    _free_dataset(dataset);
}

function make_noise_params(params) {
    var mean = "img_noise_mean" in params ? parseFloat(params["img_noise_mean"]) : 0;
    var sigma = "img_noise_sigma" in params ? parseFloat(params["img_noise_sigma"]) : 0.001;

    var noise_types = {
        Gaussian: 1,
        Motion: 2,
    };
    var noise_type = 0;
    if("img_noise_type" in params && params["img_noise_type"] == 2) {
        noise_type += noise_types["Gaussian"];
    }
    noise_params = _make_noise_params(noise_type, mean, sigma);
    return noise_params;
}

function make_params(params) {
    sequence = 0
    var sequence_enum = {
        SE: 0,
        IR: 1,
        bSSFP: 2,
        FISP: 3,
        PSIF: 4,
        SGRE: 5,
        Na: 6,
        SQ: 7,
        TQ: 8,
        TQSQR: 9,
        TQF: 10,
        pcbSSFP: 11,
    };
    var sequence_params = ["te", "tr", "ti", "fa", "tau1", "tau2", "te_start", "te_end", "te_step"];
    var s_params = [];
    var n_params = 0;
    if("tq_params" in params) {
        for(p in sequence_params) {
            if(params["tq_params"][sequence_params[p]] != undefined) {
                s_params.push(params[sequence_params[p]]);
                n_params += 1;
            }
        }
        for(p in sequence_params) {
            if(params["sq_params"][sequence_params[p]] != undefined) {
                s_params.push(params[sequence_params[p]]);
                n_params += 1;
            }
        }
    } else {
        for(p in sequence_params) {
            if(params[sequence_params[p]] != undefined) {
                s_params.push(params[sequence_params[p]]);
                n_params += 1;
            }
        }
    }
    var s_params = scalar_size == 4 ? allocFromArray(Float32Array.from(s_params)) : allocFromArray(Float64Array.from(s_params));
    var fft3d = 'fft' in params ? params['fft'] == '3d' : true;
    var use_cs = "cs" in params ? params["cs"]!=0 : false;
    var [cs_params, callback_ptr] = make_cs_params(params);
    var noise_params = make_noise_params(params);
    var filter_params = make_filter_params(params);
    c_params = _make_params(sequence_enum[params["sequence"]], n_params, s_params.byteOffset, params["xdim"], params["ydim"], params["zdim"], params["xstart"], params["ystart"], params["zstart"], params["nearest"], use_cs, fft3d, cs_params, noise_params, filter_params);
    return [c_params, callback_ptr];
}

function free_params(params) {
    _free_params(params);
}

function normalize_image(image) {
    if (image == undefined) { return image; }
    var min = Math.sqrt(image[0]*image[0]+image[1]*image[1]);
    var max = Math.sqrt(image[0]*image[0]+image[1]*image[1]);
    for(var i=0;i<image.length;i+=2) {
        if(Math.sqrt(image[i]*image[i]+image[i+1]*image[i+1])<min) { min = Math.sqrt(image[i]*image[i]+image[i+1]*image[i+1]); }
        if(Math.sqrt(image[i]*image[i]+image[i+1]*image[i+1])>max) { max = Math.sqrt(image[i]*image[i]+image[i+1]*image[i+1]); }
    }
    //console.log(min, max);
    for(var i=0;i<image.length;i++) {
        image[i] = (image[i]-min)/(max-min);
    }
    return image;
}

function simulate_fast(ds, params) {
    var xdim = Math.round(params["xdim"]);
    xdim = xdim > 0 ? xdim : k_xdim;
    xdim = xdim > k_xdim ? k_xdim : xdim;
    var ydim = Math.round(params["ydim"]);
    ydim = ydim > 0 ? ydim : k_ydim;
    ydim = ydim > k_ydim ? k_ydim : ydim;
    var zdim = Math.round(params["zdim"]);
    zdim = zdim > 0 ? zdim : k_zdim;
    zdim = zdim > k_zdim ? k_zdim : zdim;

    var [p, callback_ptr] = make_params(params);
    _simulate(p, ds);
    Module.removeFunction(callback_ptr);
    free_params(p);

    var [image, image_dim] = from_memcfl("img_sim.mem");
    var [kspace, kspace_dim] = from_memcfl("kspace_sim.mem");
    //var sen = from_memcfl(_sen_sim)[0];
    var [cs_kspace, cs_kspace_dim] = from_memcfl("kspace_cs.mem");
    var [cs_image, cs_image_dim] = from_memcfl("img_cs.mem");
    var [filt_kspace, filt_kspace_dim] = from_memcfl("kspace_filt.mem");
    var [filt_image, filt_image_dim] = from_memcfl("img_filt.mem");

    return [normalize_image(image), normalize_image(kspace), normalize_image(filt_image), normalize_image(filt_kspace), normalize_image(cs_image), normalize_image(cs_kspace)];
}

function make_cs_params(params) {
    var lambda = "cs_lambda" in params ? "-r" + params["cs_lambda"] : "-r0.001";
    var reg = "cs_reg" in params ? params["cs_reg"] : "-l1";
    var cs = "cs" in params ? parseInt(params["cs"]) : 0;
    var cs_algo = "--fista";
    switch(cs) {
        default:
        case 0:
            break;
        case 1:
            cs_algo = "--ist";
            break;
        case 2:
            cs_algo = "--fista";
            break;
        case 3:
            cs_algo = "--admm";
            break;
        case 4:
            cs_algo = "--pridu";
            break;
    }
    var callback_ptr = 0;
    if ("cs_callback" in params) {
        callback_ptr = Module.addFunction(params["cs_callback"], "vi")
    }
    var heap_algo = allocFromString(cs_algo);
    var heap_reg = allocFromString(reg);
    var heap_lambda = allocFromString(lambda)
    var cs_params = _make_cs_params(heap_algo.byteOffset, heap_reg.byteOffset, heap_lambda.byteOffset, callback_ptr)
    return [cs_params, callback_ptr];
}

function make_filter_params(params) {
    var filter_mode = "kspace_filter_mode" in params? parseInt(params["kspace_filter_mode"]):0.0;
    var filter_fraction = "kspace_filter_fraction" in params? parseFloat(params["kspace_filter_fraction"])/100.0:0.5;
    var fmin = "kspace_filter_fmin" in params? parseFloat(params["kspace_filter_fmin"]):0.0;
    var fmax = "kspace_filter_fmax" in params? parseFloat(params["kspace_filter_fmax"]):100.0;

    var filter_params = _make_filter_params(filter_mode, filter_fraction, fmin, fmax);
    return filter_params
}

/** Create a heap array from the array ar. */
function allocFromArray(ar) {
    /* Allocate */
    var nbytes = ar.length * ar.BYTES_PER_ELEMENT;
    var heapArray = alloc(nbytes);

    /* Copy */
    heapArray.set(new Uint8Array(ar.buffer));
    return heapArray;
}

/** Allocate a heap array to be passed to a compiled function. */
function alloc(nbytes) {
    var ptr = Module._malloc(nbytes)>>>0;
    return new Uint8Array(Module.HEAPU8.buffer, ptr, nbytes);
}

/** Free a heap array. */
function free(heapArray) {
    Module._free(heapArray.byteOffset);
}

function to_memcfl(name, dims, data) {
    var heapDims = allocFromArray(dims);
    var heapDims_byteOffset = heapDims.byteOffset;
    var heapName = allocFromString(name);
    var heapName_byteOffset = heapName.byteOffset
    var memcfl_byteoffset = _memcfl_create(heapName_byteOffset, dims.length, heapDims_byteOffset);
    var memcfl = new Float32Array(Module.HEAPU8.buffer, memcfl_byteoffset, data.length);
    memcfl.set(data);
    return name;
}

function from_memcfl(name) {
    var heapName = allocFromString(name);
    var heapName_byteOffset = heapName.byteOffset;

    if(!_memcfl_exists(heapName_byteOffset)) {
        return [undefined, undefined];
    }

    var heapDims = alloc(DIMS*scalar_size);
    var heapDims_byteOffset = heapDims.byteOffset;
    var out_data = _memcfl_load(heapName_byteOffset, DIMS, heapDims_byteOffset);
    
    var dims = Int32Array.from(new Int32Array(Module.HEAPU8.buffer, heapDims_byteOffset, DIMS));
    var size = 2;
    for(var dim in dims) {
        size = size*dims[dim];
    }
    var data = Float32Array.from(new Float32Array(Module.HEAPU8.buffer, out_data, size));
    //_memcfl_unmap(out_data);
    return [data, dims];
}

function list_memcfl() {
    var list_ptr = _memcfl_list_all();
    var list_count = new Int32Array(Module.HEAPU8.buffer, list_ptr, 1)[0];
    var list = new Int32Array(Module.HEAPU8.buffer, list_ptr+4, list_count);
    var files = [];
    for(var i=0;i<list_count;i++) {
        var ptr = list[i];
        if (ptr==0) {continue;}
        var name = "";
        for(;Module.HEAPU8[ptr]!=0&&Module.HEAPU8[ptr]!=undefined;ptr++) {
            name += String.fromCharCode(Module.HEAPU8[ptr]);
        }
        files.push(name);   
    }
    return files;
}

function unlink_memcfl(name) {
    heapName = allocFromString(name);
    heapName_byteOffset = heapName.byteOffset;
    _memcfl_unlink(heapName_byteOffset);
    free(heapName);
}

function allocFromString(string) {
    var heapArray = alloc(string.length+1);
    heapArray.fill(0);
    for(var i=0;i<string.length;i++) {
        heapArray[i] = string.charCodeAt(i);
    }
    return heapArray;
}

function allocFromStringArray(inArgv) {
    var heapArgv = alloc(inArgv.length*4);
    var heapArgv32 = new Int32Array(Module.HEAPU8.buffer, heapArgv.byteOffset, inArgv.length);
    for(var k in inArgv) {
        var heapArray = allocFromString(inArgv[k]);
        var heapArray_byteOffset = heapArray.byteOffset;
        heapArgv32[k] = heapArray_byteOffset;
    }
    
    return heapArgv;
}
