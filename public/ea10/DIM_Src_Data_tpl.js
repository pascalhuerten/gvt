var Data = (function () {

    // NEW DIM
    var data, labels, stats;

    function init() {
        var elem = document.createElement("INPUT");
        elem.setAttribute("type", "file");
        elem.setAttribute("id", "localfile");
        elem.style.display = "none";
        elem.addEventListener('change', readSingleFile, false);
        document.body.appendChild(elem);
    }

    function readFileFromClient() {
        var elem = document.getElementById("localfile");
        elem.click();
    }

    function readSingleFile(evt) {
        var f = evt.target.files[0];
        if (f) {
            //console.log("Reading File " + f.name);
            var r = new FileReader();
            r.onload = function (e) {
                parse(e.target.result);
            };
            r.readAsText(f);
        } else {
            alert("Could not read file.");
        }
    }

    function parse(textCSV) {
        //console.log(textCSV);
        var results = Papa.parse(textCSV, { delimiter: ',', dynamicTyping: true, skipEmptyLines: true });
        //console.log(results.data);
        //console.log(results);

        // NEW DIM out
        //var textJSON =  JSON.stringify(results.data);
        //console.log(textJSON);
        //var dataFromJSON = JSON.parse(textJSON);

        // NEW DIM stats as function parameter out
        // Set module variable.
        data = results.data;
        splitDataAndLabels();
        preprocessLabels();
        calcStats();
        app.dataLoadedCallback(data, labels, stats);
    }

    function readFileFromServer(filename) {
        var request = new XMLHttpRequest();
        if (!request) {
            console.log('Error: No XMLHttpRequest instance.');
            return false;
        }

        request.onreadystatechange = function () {
            if (request.readyState === XMLHttpRequest.DONE) {
                if (request.status === 200) {
                    parse(request.responseText);
                } else {
                    console.log('There was a problem with the request.');
                }
            }
        };

        request.open('GET', filename);
        request.send();
    }

    /*
         Get the minimum and maximum values for the first n (max 3) data columns.
         @return: object with field array of objects {min, max, range, mean} for each field
         and separate arrays with {min, max, range, mean} with field as index
         and value for maxRange
    */
    function calcStats() {
        if (!data || data.length === 0) {
            console.log("Data no valid.");
            return undefined;
        }
        // NEW DIM.
        stats = {};
        // Assumes constant number of fields in data.
        var nbFields = data[0].length;
        stats.field = Array(nbFields).fill(0);
        stats.min = Array(nbFields).fill(0);
        stats.max = Array(nbFields).fill(0);
        stats.range = Array(nbFields).fill(0);
        stats.mean = Array(nbFields).fill(0);

        var min, max, mean, i;

        for (i = 0; i < nbFields; i++) {
            min = max = undefined;
            mean = 0;
            for (var d = 0; d < data.length; d++) {
                mean += data[d][i];
                if (max === undefined || (data[d][i] > max)) {
                    max = data[d][i];
                }
                if (min === undefined || (data[d][i] < min)) {
                    min = data[d][i];
                }
            }
            mean /= data.length;
            stats.field[i] = { min: min, max: max, range: max - min, mean: mean };
            stats.min[i] = min;
            stats.max[i] = max;
            stats.range[i] = max - min;
            stats.mean[i] = mean;
        }

        // Calculate maximum data range of all fields,
        // restricted to the first 3 fields for 3D data plus extra fields.
        // NEW DIM.
        stats.maxRange = 0;
        for (i = 0; i < nbFields; i++) {
            var range = Math.abs(stats.field[i].range);
            if (range > stats.maxRange) {
                stats.maxRange = range;
            }
        }
    }

    /**
     * Create separate arrays for data and labels,
     * Delete labels from the data array.
     */
    // NEW DIM
    function splitDataAndLabels() {
        labels = [];
        // Assume one class label in last field of data.
        for (var i = 0; i < data.length; i++) {
            labels.push(data[i].pop());
        }
    }

    // New DIM
    /**
     * Do not reset labels in case new/generated data is added.
     * Converts labels to 0-indexed values for both Iris and Seeds datasets.
     */
    function preprocessLabels() {
        for (var i = 0; i < labels.length; i++) {
            switch (labels[i]) {
                case "Iris-setosa":
                    labels[i] = 0;
                    break;
                case "Iris-versicolor":
                    labels[i] = 1;
                    break;
                case "Iris-virginica":
                    labels[i] = 2;
                    break;
                case 1:
                case "1":
                    labels[i] = 1; // Kama
                    break;
                case 2:
                case "2":
                    labels[i] = 2; // Rosa
                    break;
                case 3:
                case "3":
                    labels[i] = 3; // Canadian
                    break;
            }
        }
    }

    /**
     *
     * @param n root number of data points
     * @param r radius
     * @param offset
     * @param label
     */
    function generateSphereData(n, r, offset, label) {
        n = (typeof n !== 'undefined') ? n : 16;
        r = (typeof r !== 'undefined') ? r : 1;
        offset = (typeof offset !== 'undefined') ? offset : [0, 0, 0];
        label = (typeof label !== 'undefined') ? label : 1;
        data = (typeof data !== 'undefined') ? data : [];

        var du = 2 * Math.PI / n;
        var dv = Math.PI / n;
        // Loop angle u.
        for (var i = 0, u = 0; i <= n; i++, u += du) {
            // Loop angle v.
            for (var j = 0, v = 0; j <= n; j++, v += dv) {
                var x = offset[0] + r * Math.sin(v) * Math.cos(u);
                var y = offset[1] + r * Math.sin(v) * Math.sin(u);
                var z = offset[2] + r * Math.cos(v);

                data.push([x, y, z, label]);
            }
        }
    }

    // NEW DIM
    function generateData() {

        // Generate one sphere.function generateData() {
        data = [];

        data.experiment = "separate spheres";
        generateSphereData(16, 1, [0, 0, 0], 0);
        generateSphereData(16, 1, [3, 0, 0], 1);

        splitDataAndLabels();
        preprocessLabels();
        calcStats();

        //Display experiment name.
        var elem = document.getElementById('experiment');
        elem.innerHTML = data.experiment + "  ";

        app.dataLoadedCallback(data, labels, stats);
    }

    // NEW DIM
    /**
     * Combine data and labels.
     * @returns {string} data as CSV
     */
    function dataToCSV() {
        // Deep copy data.
        var dat = JSON.parse(JSON.stringify(data));
        // Add labels to dat (as last argument).
        for (var i = 0; i < dat.length; i++) {
            dat[i].push(labels[i]);
        }
        return Papa.unparse(dat);
    }

    // NEW DIM
    function linkDownload(a, filename, content) {
        var contentType = 'data:application/octet-stream,';
        var uriContent = contentType + encodeURIComponent(content);
        a.setAttribute('href', uriContent);
        a.setAttribute('download', filename);
    }

    // NEW DIM
    function downloadData() {
        var a = document.createElement('a');
        linkDownload(a, "data.csv", dataToCSV());
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // NEW DIM
    function setData(dat) {
        data = dat;
    }

    function getData() {
        return data;
    }

    return {
        init: init,
        readFileFromClient: readFileFromClient,
        readFileFromServer: readFileFromServer,
        // NEW DIM
        generateData: generateData,
        setData: setData,
        getData: getData,
        downloadData: downloadData
    };
}());
