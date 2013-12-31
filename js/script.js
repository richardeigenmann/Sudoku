function load() {
    var outerDiv = document.getElementById("Sudoku");
    drawGrid(outerDiv);

    // Setup the dnd listeners.
    var dropZone = document.getElementById('stepsList');
    dropZone.addEventListener('dragover', handleDragOver, false);
    dropZone.addEventListener('drop', handleFileSelect, false);

}

function doSubNumberClick() {
    var source = this.id;
    var row = source.substring(9, 10);
    var col = source.substring(10, 11);
    var number = source.substring(12, 13);
    pickNumber(row, col, number);
    recordStep(row, col, number, "show");
}

function doRedraw() {
    var outerDiv = document.getElementById("Sudoku");
    drawGrid(outerDiv);

    var liElements = document.getElementsByTagName('li');
    var li = null;
    for (var i = 0; i < liElements.length; ++i) {
        var li = liElements[i];
        var checkbox = li.firstChild;
        if (checkbox.checked) {
            var textNode = checkbox.nextSibling;
            var row = textNode.substringData(5, 1);
            var col = textNode.substringData(12, 1);
            var number = textNode.substringData(15, 1);
            var show = textNode.substringData(17, 4);
            if ( show === "show") {
                pickNumber(row, col, number);
            } else {
                removeOption(row,col,number);
            }
        }
    }
}

function pickNumber(row, col, number) {
    setNumber(row, col, number);
    findCollisions(row, col, number);
    removeOptions(row, col, number);
    highlightSingletons();
}

function doClear() {
    var steps = document.getElementById("steps");
    steps.innerHTML = "";

    var outerDiv = document.getElementById("Sudoku");
    drawGrid(outerDiv);
}


function drawGrid(baseElement) {
    var outerTable = document.createElement("Table");
    outerTable.className = "outer";

    for (var i = 0; i < 3; i++) {
        outerTable.appendChild(getMainRow(i));
    }

    while (baseElement.hasChildNodes()) {
        baseElement.removeChild(baseElement.lastChild);
    }
    baseElement.appendChild(outerTable);
}

function getMainRow(rowNumber) {
    var mainRow = document.createElement("TR");
    for (var i = 0; i < 3; i++) {
        var mainBlock = getMainBlock(rowNumber * 3, i * 3);
        mainRow.appendChild(mainBlock);
    }
    return mainRow;
}

function getMainBlock(rowNumber, colNumber) {
    var mainBlock = document.createElement("TD");
    mainBlock.className = "mainBlock";
    var numberBlock = document.createElement("Table");
    numberBlock.className = "numberBlock";
    for (var i = 1; i < 4; i++) {
        var numberRow = document.createElement("TR");
        for (var j = 1; j < 4; j++) {
            var numberCell = document.createElement("TD");
            numberCell.id = "cell" + (rowNumber + i) + "" + (colNumber + j);
            numberCell.className = "numberCell";

            var numberSpan = document.createElement("span");
            //numberSpan.className="visibleNumberSpan";
            numberSpan.className = "displayNone";
            numberSpan.id = "span" + (rowNumber + i) + "" + (colNumber + j);
            numberSpan.appendChild(document.createTextNode("row: " + (rowNumber + i) + " col: " + (colNumber + j)));

            numberCell.appendChild(numberSpan);
            numberCell.appendChild(getSubNumberTable(rowNumber + i, colNumber + j));

            numberRow.appendChild(numberCell);
        }
        numberBlock.appendChild(numberRow);

    }
    mainBlock.appendChild(numberBlock);
    return mainBlock;
}

function getSubNumberTable(row, col) {
    var subNumberTable = document.createElement("Table");
    subNumberTable.className = "subNumberTable";
    subNumberTable.id = "subTable" + row + "" + col;
    number = 1;
    for (var i = 0; i < 3; i++) {
        var tr = document.createElement("TR");
        subNumberTable.appendChild(tr);
        for (var j = 0; j < 3; j++) {
            var td = document.createElement("TD");
            tr.appendChild(td);
            td.id = "subNumber" + row + "" + col + "." + number;
            td.appendChild(document.createTextNode(number));
            td.onclick = doSubNumberClick;
            number++;
        }
    }
    return subNumberTable;
}

function setNumber(row, col, number) {
    var span = document.getElementById("span" + row + col);
    var subNumberTable = document.getElementById("subTable" + row + col);
    span.innerHTML = number;
    span.className = "visibleNumberSpan";
    subNumberTable.className = "displayNone";
}

function recordStep(row, col, number, show) {
    var steps = document.getElementById("steps");
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.onchange = doRedraw;

    var li = document.createElement("li");
    li.appendChild(checkbox);
    li.appendChild(document.createTextNode("Row: " + row + " Col: " + col + ": " + number + " " + show));

    li.appendChild(document.createTextNode(" "));

    var deleteButton = document.createElement("button");
    deleteButton.innerHTML = "delete";
    deleteButton.onclick = doDeleteButtonClick;
    li.appendChild(deleteButton);

    var hideButton = document.createElement("button");
    hideButton.innerHTML = "hide";
    hideButton.onclick = doHideButtonClick;
    li.appendChild(hideButton);

    steps.appendChild(li);

    var innerStepsList = document.getElementById("innerStepsList");
    innerStepsList.scrollTop = innerStepsList.scrollHeight;
}

function doDeleteButtonClick(e) {
    e.srcElement.parentNode.parentNode.removeChild(e.srcElement.parentNode);
    doRedraw();
}

function doHideButtonClick(e) {
    var li = e.srcElement.parentNode;
    var textNode = li.childNodes[1];
    var string = textNode.nodeValue;
    string = string.replace ("show","hide");
    textNode.nodeValue=string;

    doRedraw();
}


function findCollisions(row, col, number) {
    // check row
    for (var i = 1; i < 10; i++) {
        if (i == col)
            continue;
        var test = getNumber(row, i);
        if (test == number) {
            flagCollisions(row, col, row, i);
        }
    }
    // check column
    for (var i = 1; i < 10; i++) {
        if (i == row)
            continue;
        var test = getNumber(i, col);
        if (test == number) {
            flagCollisions(row, col, i, col);
        }
    }
    // check grid
    var x = Math.floor((row - 1) / 3) * 3 + 1;
    var y = Math.floor((col - 1) / 3) * 3 + 1;
    for (var i = x; i < x + 3; i++) {
        for (var j = y; j < y + 3; j++) {
            if ((i == row) && (j == col))
                continue;
            var test = getNumber(i, j);
            if (test == number) {
                flagCollisions(row, col, i, j);
            }
        }
    }
}

/**
 * Highlights the collisions visually
 */
function flagCollisions(row1, col1, row2, col2) {
    var firstNumber = document.getElementById("span" + row1 + col1);
    var secondNumber = document.getElementById("span" + row2 + col2);
    firstNumber.className = "collisionNumberSpan";
    secondNumber.className = "collisionNumberSpan";
}


function removeOptions(row, col, number) {
    // check row
    for (var i = 1; i < 10; i++) {
        if (i == col)
            continue;
        var test = getNumber(row, i);
        if (test == 0) {
            removeOption(row, i, number);
        }
    }
    // check column
    for (var i = 1; i < 10; i++) {
        if (i == row)
            continue;
        var test = getNumber(i, col);
        if (test == 0) {
            removeOption(i, col, number);
        }
    }
    // check grid
    var x = Math.floor((row - 1) / 3) * 3 + 1;
    var y = Math.floor((col - 1) / 3) * 3 + 1;
    for (var i = x; i < x + 3; i++) {
        for (var j = y; j < y + 3; j++) {
            if ((i == row) && (j == col))
                continue;
            var test = getNumber(i, j);
            if (test == 0) {
                removeOption(i, j, number);
            }
        }
    }
}


/**
 * Removes a subindex option
 * @param {type} row
 * @param {type} col
 * @param {type} number
 * @returns {undefined}
 */
function removeOption(row, col, number) {
    var subNumber = document.getElementById("subNumber" + row + col + "." + number);
    subNumber.className = "displayNone";
}


/**
 * returns the number set at the coordinates or 0 if no number is set.
 */
function getNumber(row, col) {
    var span = document.getElementById("span" + row + col);
    var name = span.className;
    if (name === "displayNone") {
        return 0;
    } else {
        node = span.firstChild;
        return node.textContent ? node.textContent : node.innerText;
    }
}


function writeFile() {
    var csvData = "";
    for (var x = 1; x < 10; x++) {
        for (var y = 1; y < 10; y++) {
            var number = getNumber(x, y);
            csvData = csvData + number + ","
        }
        csvData = csvData + "\n"
    }
    csvData = csvData + "\n"

    var liElements = document.getElementsByTagName('li');
    var li = null;
    for (var i = 0; i < liElements.length; ++i) {
        var li = liElements[i];
        var checkbox = li.firstChild;
        if (checkbox.checked) {
            var textNode = checkbox.nextSibling;
            var row = textNode.substringData(5, 1);
            var col = textNode.substringData(12, 1);
            var number = textNode.substringData(15, 1);
            var show = textNode.substringData(17, 4);
            csvData = csvData + "Row: " + row + " Col: " + col + " Number: " + number + " Show: " + show + "\n";
        }
    }

    window.open('data:text/csv;charset=utf-8,' + escape(csvData));
}


function handleFileSelect(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    var files = evt.dataTransfer.files; // FileList object.
    if (files.length > 0) {
        var reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = (function(theFile) {
            return function(e) {
                var data = e.target.result;
                doClear();
                var startPosition = 0;
                var foundPosition = data.indexOf("Row", startPosition)
                while (foundPosition > 0) {
                    var row = data.substring(foundPosition + 5, foundPosition + 6);
                    var col = data.substring(foundPosition + 12, foundPosition + 13);
                    var number = data.substring(foundPosition + 22, foundPosition + 23);
                    var show = data.substring(foundPosition + 30, foundPosition + 34);
                    pickNumber(row, col, number);
                    recordStep(row, col, number, show);
                    foundPosition = data.indexOf("Row", foundPosition + 1)
                }
            };
        })(files[0]);

        reader.readAsText(files[0]);
    }
}

function handleDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

function highlightSingletons() {
    for (var row = 1; row < 10; row++) {
        for (var col = 1; col < 10; col++) {
            var number = getNumber(row, col);
            if (number === 0) {
                for (var i = 1; i < 10; i++) {
                    var subNumberElement = document.getElementById("subNumber" + row + col + "." + i);
                    var subNumberClass = subNumberElement.className;
                    if (!(subNumberClass === "displayNone")) {
                        if (isSingleton(row, col, i)) {
                            subNumberElement.className = "singleton";
                        }
                    }
                }
            }
        }
    }
}

function isSingleton(row, col, index) {
    // check row
    var rowSingleton = true;
    for (var testCol = 1; testCol < 10; testCol++) {
        if (testCol == col) {
            continue; //self
        }
        var test = getNumber(row, testCol);
        if (test > 0) {
            continue;
        }
        var subNumberElement = document.getElementById("subNumber" + row + testCol + "." + index);
        var subNumberClass = subNumberElement.className;
        if (!(subNumberClass === "displayNone")) {
            // it is showing therefor is not a singleton
            rowSingleton = false;
            break;
        }
    }

    // check col
    var colSingleton = true;
    for (var testRow = 1; testRow < 10; testRow++) {
        if (testRow == row) {
            continue; //self
        }
        var test = getNumber(testRow, col);
        if (test > 0) {
            continue;
        }
        var subNumberElement = document.getElementById("subNumber" + testRow + col + "." + index);
        var subNumberClass = subNumberElement.className;
        if (!(subNumberClass === "displayNone")) {
            // it is showing therefore is not a singleton
            colSingleton = false;
            break;
        }
    }

    // check grid
    var gridSingleton = true;
    var x = Math.floor((row - 1) / 3) * 3 + 1;
    var y = Math.floor((col - 1) / 3) * 3 + 1;
    for (var i = x; i < x + 3; i++) {
        for (var j = y; j < y + 3; j++) {
            if ((i === row) && (j === col)) {
                continue; //self
            }
            var test = getNumber(i, j);
            if (test > 0) {
                continue;
            }
            var subNumberElement = document.getElementById("subNumber" + i + j + "." + index);
            var subNumberClass = subNumberElement.className;
            if (!(subNumberClass === "displayNone")) {
                gridSingleton = false;
                break;
            }
        }
    }

    return rowSingleton || colSingleton || gridSingleton;
}

