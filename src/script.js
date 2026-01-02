/**
 * This script generates the Sudoku grid, handles the user response and
 * handles the saving and loading of Sudoku data.
 * 
 * @author Richard Eigenmann, Zürich, Switzerland
 * richard.eigenmann@gmail.com
 * Written in December 2013
 * License: GPL v2
 * Code repository: https://github.com/richardeigenmann/Sudoku/
 */

/**
 * Main entry point 
 */
function load() {
    drawGrid();

    // Setup the dnd listeners.
    var dropZone = document.getElementById('stepsDiv');
    dropZone.addEventListener('dragover', doDragOver, false);
    dropZone.addEventListener('drop', doDropFile, false);
}

/**
 * Handle the click by a user on a subindex number
 * @returns {undefined}
 */
function doSubNumberClick() {
    var source = this.id;
    var row = source.substring(9, 10);
    var col = source.substring(10, 11);
    var number = source.substring(12, 13);
    pickNumber(row, col, number);
    recordStep(row, col, number, "show");
}

/**
 * Clears the grid and applies one step after the other.
 */
function doRedraw() {
    drawGrid();

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
            if (show === "show") {
                pickNumber(row, col, number);
            } else {
                removeOption(row, col, number);
            }
        }
    }
}

/**
 * Main interaction point: Picks the number on the grid, 
 * finds collisions and highlights them, dimms the invalidated
 * options and highlight singletons.
 * @param {type} row
 * @param {type} col
 * @param {type} number
 * @returns {undefined}
 */
function pickNumber(row, col, number) {
    setNumber(row, col, number);
    highlightCompleted();
    findCollisions(row, col, number);
    removeOptions(row, col, number);
    highlightSingletons();
}

/**
 * Clears the steps array
 * @returns {undefined}
 */
function clearSteps() {
    var steps = document.getElementById("steps");
    steps.innerHTML = "";
    drawGrid();
}

/**
 * Draws the Sudoku grid with the appropriate class elements.
 * @param {type} baseElement
 * @returns {undefined}
 */
function drawGrid() {
    var outerTable = document.createElement("Table");
    outerTable.className = "outer";

    for (var mainRowNumber = 0; mainRowNumber < 3; mainRowNumber++) {
        var mainRow = document.createElement("TR");
        for (var mainColNumber = 0; mainColNumber < 3; mainColNumber++) {
            var mainBlock = getMainBlock(mainRowNumber * 3, mainColNumber * 3);
            mainRow.appendChild(mainBlock);
        }
        outerTable.appendChild(mainRow);
    }

    var baseElement = document.getElementById("Sudoku");
    while (baseElement.hasChildNodes()) {
        baseElement.removeChild(baseElement.lastChild);
    }
    baseElement.appendChild(outerTable);
}

/**
 * Returns a TD element with 9 numbers
 * @param {type} rowNumber
 * @param {type} colNumber
 * @returns {getMainBlock.mainBlock|Element}
 */
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
            numberSpan.className = "displayNone";
            numberSpan.id = "span" + (rowNumber + i) + "" + (colNumber + j);
            numberSpan.appendChild(document.createTextNode(""));
            numberCell.appendChild(numberSpan);
            numberCell.appendChild(getSubNumberTable(rowNumber + i, colNumber + j));

            numberRow.appendChild(numberCell);
        }
        numberBlock.appendChild(numberRow);

    }
    mainBlock.appendChild(numberBlock);
    return mainBlock;
}

/**
 * Returns a handle to the subnumber table for the specified row and column
 * @param {type} row
 * @param {type} col
 * @returns {getSubNumberTable.subNumberTable|Element}
 */
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

/**
 * Puts a picked number in the grid
 * @param {type} row
 * @param {type} col
 * @param {type} number
 * @returns nothing
 */
function setNumber(row, col, number) {
    var span = document.getElementById("span" + row + col);
    var subNumberTable = document.getElementById("subTable" + row + col);
    span.innerHTML = number;
    span.className = "";
    subNumberTable.className = "displayNone";
}

/**
 * Records the step
 * @param {type} row
 * @param {type} col
 * @param {type} number
 * @param {type} show  "show" means the number will be picked, "hide" means 
 *      that the number should be removed from the subindex selections
 * @returns {undefined}
 */
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

/**
 * This function is called when the user click the delete button. It removes the
 * entry from the list of steps.
 * @param {type} e
 * @returns {undefined}
 */
function doDeleteButtonClick(e) {
    e.srcElement.parentNode.parentNode.removeChild(e.srcElement.parentNode);
    doRedraw();
}

/**
 * This function is called when the user click the hide button. It changes the 
 * behaviour of the step: instead of picking the number it removes the number 
 * from the available subindex choices.
 * @param {type} e
 * @returns {undefined}
 */
function doHideButtonClick(e) {
    var li = e.srcElement.parentNode;
    var textNode = li.childNodes[1];
    var string = textNode.nodeValue;
    string = string.replace("show", "hide");
    textNode.nodeValue = string;

    doRedraw();
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

/**
 * This method finds collisions between mutliple picked numbers on the same 
 * row, column or block and highlights them in red.
 * @param {type} row
 * @param {type} col
 * @param {type} number
 * @returns {undefined}
 */
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
 * @param {type} row1 The row of the first collision number
 * @param {type} col1 The column of the first collision number
 * @param {type} row2 The row of the second collision number
 * @param {type} col2 The column of the second collision number
 * @returns {undefined}
 */
function flagCollisions(row1, col1, row2, col2) {
    var firstCell = document.getElementById("cell" + row1 + col1);
    var secondCell = document.getElementById("cell" + row2 + col2);
    firstCell.className = "numberCell collision";
    secondCell.className = "numberCell collision";
}

/**
 * This function zips through the Sudoku row, column and sub-square 
 * removing all subindex options that are invalid now that number was set
 * (setting class to 'displayNone').
 * @param {type} row The row of the number that was set
 * @param {type} col The column of the number that was set
 * @param {type} number The Number that was set to this coordinate.
 * @returns nothing
 */
function removeOptions(row, col, number) {
    // check row
    for (var i = 1; i < 10; i++) {
        if (i === col)
            continue;
        if (getNumber(row, i) === 0) {
            removeOption(row, i, number);
        }
    }
    // check column
    for (var i = 1; i < 10; i++) {
        if (i === row)
            continue;
        if (getNumber(i, col) === 0) {
            removeOption(i, col, number);
        }
    }
    // check grid
    var x = Math.floor((row - 1) / 3) * 3 + 1;
    var y = Math.floor((col - 1) / 3) * 3 + 1;
    for (var i = x; i < x + 3; i++) {
        for (var j = y; j < y + 3; j++) {
            if ((i === row) && (j === col))
                continue;
            if (getNumber(i, j) === 0) {
                removeOption(i, j, number);
            }
        }
    }
}


/**
 * Removes a subindex option (by setting it's class to 'displayNone' class.
 * @param {type} row The row coordinate of the subindex to remove
 * @param {type} col The column coordinate of the subindex to remove
 * @param {type} number The subindex number to remove
 * @returns nothing
 */
function removeOption(row, col, number) {
    var subNumber = document.getElementById("subNumber" + row + col + "." + number);
    subNumber.className = "pickedNumber";
}


/**
 * This function zips through all showing subindex humbers and highlights those
 * that are "forced" numbers because they are the only number on the row, the
 * only number on the column or only number of the immediate block.
 * @returns nothing
 */
function highlightSingletons() {
    for (var row = 1; row < 10; row++) {
        for (var col = 1; col < 10; col++) {
            var number = getNumber(row, col);
            if (number === 0) {
                for (var i = 1; i < 10; i++) {
                    var subNumberElement = document.getElementById("subNumber" + row + col + "." + i);
                    var subNumberClass = subNumberElement.className;
                    if (!(subNumberClass === "pickedNumber")) {
                        if (isSingleton(row, col, i)) {
                            subNumberElement.className = "singleton";
                        }
                    }
                }
            }
        }
    }
}

/**
 * This function returns true or false based on whether the indicated subindex
 * is a singleton or not. 
 * @see highlightSingeletons
 * @param {type} row 
 * @param {type} col
 * @param {type} index  The number of the subindex.
 * @returns {Boolean} true if it is a singleton false if not.
 */
function isSingleton(row, col, index) {
    // check row
    var rowSingleton = true;
    for (var testCol = 1; testCol < 10; testCol++) {
        if (testCol === col) {
            continue; //self don't need to check whether a number was picked on my own cell
        }
        if (getNumber(row, testCol) > 0) {
            continue; // 
        }
        var subNumberElement = document.getElementById("subNumber" + row + testCol + "." + index);
        if (!(subNumberElement.className === "pickedNumber")) {
            // it is showing therefore is not a singleton
            rowSingleton = false;
            break;
        }
    }

    // check col
    var colSingleton = true;
    for (var testRow = 1; testRow < 10; testRow++) {
        if (testRow === row) {
            continue; //self
        }
        if (getNumber(testRow, col) > 0) {
            continue;
        }
        var subNumberElement = document.getElementById("subNumber" + testRow + col + "." + index);
        if (!(subNumberElement.className === "pickedNumber")) {
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
            if (getNumber(i, j) > 0) {
                continue;
            }
            var subNumberElement = document.getElementById("subNumber" + i + j + "." + index);
            if (!(subNumberElement.className === "pickedNumber")) {
                gridSingleton = false;
                break;
            }
        }
    }

    // only one pickable
    var onlyOnePickable = true;
    for (var i = 1; i < 10; i++) {
        if (i === index) {
            continue; // self
        }
        var subNumberElement = document.getElementById("subNumber" + row + col + "." + i);
        if (!(subNumberElement.className === "pickedNumber")) {
            onlyOnePickable = false;
            break;
        }
    }

    return rowSingleton || colSingleton || gridSingleton || onlyOnePickable;
}


/**
 * This function highlights completed rows, columns and blocks
 * @returns nothing
 */
function highlightCompleted() {
    for (var row = 1; row < 10; row++) {
        var sum = 0;
        for (var col = 1; col < 10; col++) {
            sum += parseInt(getNumber(row, col));
        }
        if (sum === 45) {
            for (var col = 1; col < 10; col++) {
                var cell = document.getElementById("cell" + row + col);
                cell.className = "numberCell completed";
            }
        }
    }
    for (var col = 1; col < 10; col++) {
        var sum = 0;
        for (var row = 1; row < 10; row++) {
            sum += parseInt(getNumber(row, col));
        }
        if (sum === 45) {
            for (var row = 1; row < 10; row++) {
                var cell = document.getElementById("cell" + row + col);
                cell.className = "numberCell completed";
            }
        }
    }
    for (var blockRow = 0; blockRow < 3; blockRow++) {
        for (var blockCol = 0; blockCol < 3; blockCol++) {
            var sum = 0;
            for (var row = blockRow * 3 + 1; row < blockRow * 3 + 4; row++) {
                for (var col = blockCol * 3 + 1; col < blockCol * 3 + 4; col++) {
                    sum += parseInt(getNumber(row, col));
                }
            }
            if (sum === 45) {
                for (var row = blockRow * 3 + 1; row < blockRow * 3 + 4; row++) {
                    for (var col = blockCol * 3 + 1; col < blockCol * 3 + 4; col++) {
                        var cell = document.getElementById("cell" + row + col);
                        cell.className = "numberCell completed";
                    }
                }
            }
        }
    }

}


/**
 * Writes the Sudoku grid and the steps to a comma separated text file.
 * @returns nothing
 */
function writeFile() {
    var csvData = "";
    for (var x = 1; x < 10; x++) {
        for (var y = 1; y < 10; y++) {
            var number = getNumber(x, y);
            csvData = csvData + number + ",";
        }
        csvData = csvData + "\n";
    }
    csvData = csvData + "\n";

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

/**
 * Part of the drag and drop function to allow dropping of a saved Sudoku file
 * to the page
 * @param {type} evt
 * @returns {undefined}
 */
function doDragOver(evt) {
    evt.stopPropagation();
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}

/**
 * This function opens and parses the dropped saved Sudoku data file.
 * @param {type} evt
 * @returns {undefined}
 */
function doDropFile(evt) {
    evt.stopPropagation();
    evt.preventDefault();

    var files = evt.dataTransfer.files; // FileList object. 
    if (files.length > 0) {
        var reader = new FileReader();

        // Closure to capture the file information.
        reader.onload = (function (theFile) {
            return function (e) {
                var data = e.target.result;
                clearSteps();
                var startPosition = 0;
                var foundPosition = data.indexOf("Row", startPosition);
                while (foundPosition > 0) {
                    var row = data.substring(foundPosition + 5, foundPosition + 6);
                    var col = data.substring(foundPosition + 12, foundPosition + 13);
                    var number = data.substring(foundPosition + 22, foundPosition + 23);
                    var show = data.substring(foundPosition + 30, foundPosition + 34);
                    if (show === "show") {
                        pickNumber(row, col, number);
                    } else {
                        removeOption(row, col, number);
                    }
                    recordStep(row, col, number, show);
                    foundPosition = data.indexOf("Row", foundPosition + 1);
                }
            };
        })(files[0]);

        reader.readAsText(files[0]);
    }
}

module.exports = {
    isSingleton,
    getNumber,
    findCollisions,
    removeOptions,
    highlightCompleted,
    pickNumber,
    setNumber,
    removeOption,
    drawGrid
};
