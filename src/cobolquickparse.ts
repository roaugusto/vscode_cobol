import ISourceHandler from "./isourcehandler";
import { cobolKeywordDictionary } from "./keywords/cobolKeywords";

import { workspace } from 'vscode';

export enum COBOLTokenStyle {
    CopyBook = "Copybook",
    ProgramId = "Program-Id",
    FunctionId = "Function-Id",
    Constructor = "Constructor",
    MethodId = "Method-Id",
    Property = "Property",
    ClassId = "Class-Id",
    InterfaceId = "Interface-Id",
    ValueTypeId = "Valuetype-Id",
    EnumId = "Enum-id",
    Section = "Section",
    Paragraph = "Paragraph",
    Division = "Division",
    EntryPoint = "Entry",
    Variable = "Variable",
    Constant = "Constant",

    Null = "Null"
}
export function splitArgument(input: string, sep: RegExp = /\s/g, keepQuotes: boolean = true): string[] {
    let separator = sep || /\s/g;
    var singleQuoteOpen = false;
    var doubleQuoteOpen = false;
    var tokenBuffer = [];
    var ret = [];

    var arr = input.split('');
    for (var i = 0; i < arr.length; ++i) {
        var element = arr[i];
        var matches = element.match(separator);
        if (element === "'" && !doubleQuoteOpen) {
            if (keepQuotes === true) {
                tokenBuffer.push(element);
            }
            singleQuoteOpen = !singleQuoteOpen;
            continue;
        } else if (element === '"' && !singleQuoteOpen) {
            if (keepQuotes === true) {
                tokenBuffer.push(element);
            }
            doubleQuoteOpen = !doubleQuoteOpen;
            continue;
        }

        if (!singleQuoteOpen && !doubleQuoteOpen && matches) {
            if (tokenBuffer.length > 0) {
                ret.push(tokenBuffer.join(''));
                tokenBuffer = [];
            } else if (!!sep) {
                ret.push(element);
            }
        } else {
            tokenBuffer.push(element);
        }
    }
    if (tokenBuffer.length > 0) {
        ret.push(tokenBuffer.join(''));
    } else if (!!sep) {
        ret.push('');
    }
    return ret;
}

class COBOLToken {
    public tokenType: COBOLTokenStyle;
    public startLine: number;
    public startColumn: number;
    public token: string;
    public description: string;
    public level: number;
    public parentToken: COBOLToken | undefined;
    public endLine: number;
    public endColumn: number;

    public childTokens: COBOLToken[] = [];

    static Null: COBOLToken = new COBOLToken(COBOLTokenStyle.Null, -1, "", "", "", undefined);

    public constructor(tokenType: COBOLTokenStyle, startLine: number, line: string, token: string, description: string, parentToken: COBOLToken | undefined) {
        this.tokenType = tokenType;
        this.startLine = startLine;
        this.startColumn = line.indexOf(token.trim());
        this.description = description;
        this.endLine = this.endColumn = 0;
        this.level = (parentToken === undefined) ? 1 : 1 + parentToken.level;
        this.parentToken = parentToken;
        this.token = token.trim();
        switch (this.tokenType) {
            case COBOLTokenStyle.Division: this.startColumn--; break;
            case COBOLTokenStyle.Section: this.startColumn--; break;
            case COBOLTokenStyle.Paragraph: this.startColumn--; break;
            case COBOLTokenStyle.EntryPoint: this.startColumn--; break;
            case COBOLTokenStyle.ClassId: this.startColumn--; break;
            case COBOLTokenStyle.MethodId: this.startColumn--; break;
            case COBOLTokenStyle.Property: this.startColumn--; break;
            case COBOLTokenStyle.Constructor: this.startColumn--; break;
        }

        if (this.token.length !== 0) {
            /* ensure we don't have any odd start columns */
            if (this.startColumn < 0) {
                this.startColumn = 0;
            }
        }
    }

    public dump() {
        let prefix = "";
        for (let i = 1; i < this.level; i++) {
            prefix += " ";
        }
        console.log(prefix + this.tokenType + "=>" +
            this.startLine + ":" + this.startColumn + "<=>" +
            this.endLine + ":" + this.endColumn +
            " is [" + this.description + "]");
    }
}

class Token {
    public lineNumber: number = 0;
    public line: string = "";

    private lineTokens: string[] = [];
    private tokenIndex: number = 0;

    public currentToken: string = "";
    public prevToken: string = "";
    public nextToken: string = "";
    public nextPlusOneToken: string = "";  // only used for method-id. get property xxx
    
    public currentTokenLower: string = "";
    public prevTokenLower: string = "";
    public nextTokenLower: string = "";


    public currentCol: number = 0;
    public prevCol: number = 0;
    public rollingColumn: number = 0;

    public endsWithDot: boolean = false;

    public constructor(line: string, previousToken?: Token) {
        this.lineNumber = 1;

        this.line = line;
        this.setupLine();

        if (previousToken !== undefined) {
            if (previousToken.lineTokens.length > 0) {
                let lastToken = previousToken.lineTokens[previousToken.lineTokens.length - 1];
                this.prevCol = previousToken.line.indexOf(lastToken);
                this.prevToken = lastToken;
                this.prevTokenLower = lastToken.toLowerCase();
            }
        }
    }

    public static Blank = new Token("", undefined);

    private setupLine() {
        let possibleTokens = splitArgument(this.line);
        //this.line.split(/[\s \,]/g); //.filter(v=>v!=='');
        this.lineTokens = [];
        for (let l = 0; l < possibleTokens.length; l++) {
            if (possibleTokens[l] !== undefined) {
                let possibleToken = possibleTokens[l].trim();
                if (possibleToken.length > 0) {
                    this.lineTokens.push(possibleToken);
                }
            }
        }

        this.tokenIndex = 0;
        this.setupToken();
    }

    private setupToken() {
        this.prevToken = this.currentToken.trim();
        this.prevTokenLower = this.currentTokenLower.trim();

        this.currentToken = this.lineTokens[this.tokenIndex];
        if (this.currentToken === undefined) {
            this.currentToken = "";
        }
        this.currentToken = this.currentToken.trim();
        this.currentTokenLower = this.currentToken.toLowerCase();

        this.prevCol = this.currentCol;
        this.currentCol = this.line.indexOf(this.currentToken, this.rollingColumn);
        this.rollingColumn = this.currentCol + this.currentToken.length;

        /* setup next token + 1 */
        if (2 + this.tokenIndex < this.lineTokens.length) {
            this.nextPlusOneToken = this.lineTokens[2 + this.tokenIndex];
        } else {
            this.nextPlusOneToken = "";
        }

        if (1 + this.tokenIndex < this.lineTokens.length) {
            this.nextToken = this.lineTokens[1 + this.tokenIndex];
            if (this.nextToken === undefined) {
                this.nextToken = "";
            }
            this.nextToken = this.nextToken.trim();
            this.nextTokenLower = this.nextToken.toLowerCase();
        } else {
            this.nextToken = this.nextTokenLower = "";
        }

        
    }

    public moveToNextToken(): boolean {
        if (1 + this.tokenIndex > this.line.length) {
            return true;
        }

        this.tokenIndex++;
        this.setupToken();
        return false;
    }

    
}

export default class QuickCOBOLParse {
    public divisions: COBOLToken[] = [];

    public tokensInOrder: COBOLToken[] = [];

    public isValidLiteral(id: string): boolean {

        if (id === null || id.length === 0) {
            return false;
        }

        /* does it include a . ? */
        if (id.indexOf(".") !== -1) {
            return false;
        }

        let regex = /^[a-zA-Z][a-zA-Z0-9-_]*/g;

        if (id.match(regex)) {
            return true;
        }

        return false;
    }

    
    public isParagraph(id: string): boolean {

        if (id === null || id.length === 0) {
            return false;
        }

        /* does it include a . ? */
        if (id.indexOf(".") !== -1) {
            return false;
        }

        let regex = /^[a-zA-Z0-9][a-zA-Z0-9-_]*/g;

        if (id.match(regex)) {
            return true;
        }

        return false;
    }

    public isValidQuotedLiteral(id: string): boolean {

        if (id === null || id.length === 0) {
            return false;
        }
        id = id.replace(/\"/g, "");
        id = id.replace(/\'/g, "");

        return this.isValidLiteral(id);
    }

    inProcedureDivision: boolean;
    pickFields: boolean;

    currentDivision: COBOLToken;
    procedureDivsion: COBOLToken;
    parseColumnBOnwards: boolean = this.getColumBParsing();

    public constructor(sourceHandler: ISourceHandler) {
        this.inProcedureDivision = false;
        this.pickFields = false;
        this.currentDivision = COBOLToken.Null;
        this.procedureDivsion = COBOLToken.Null;

        let prevToken: Token = Token.Blank;

        for (let l = 0; l < sourceHandler.getLineCount(); l++) {
            try {
                let line = sourceHandler.getLine(l).trimRight();
                
                // don't parse a empty line
                if (line.length > 0) {
                    if (prevToken.endsWithDot === false) {
                        prevToken = this.parseLineByLine(sourceHandler, l, prevToken, line);
                    }
                    else {
                        prevToken = this.parseLineByLine(sourceHandler, l, Token.Blank, line);
                    }
                }
            }
            catch (e) {
                console.log("CobolQuickParse - Parse error : " + e);
                console.log(e.stack);
            }
        }
        this.updateEndings(sourceHandler);
    }

    private isValidKeyword(keyword: string): boolean {
        return cobolKeywordDictionary.containsKey(keyword);
    }

    private isNumber(value: string | number): boolean {
        if (value.toString().length === 0) {
            return false;
        }
        return !isNaN(Number(value.toString()));
    }

    private trimLiteral(literal: string) {
        let literalTrimmed = literal.trim();

        /* remove quotes */
        if (literalTrimmed.startsWith("\"") && literalTrimmed.endsWith("\"")) {
            return literalTrimmed.substr(1, literalTrimmed.length - 2);
        }

        /* remove quotes */
        if (literalTrimmed.startsWith("\'") && literalTrimmed.endsWith("\'")) {
            return literalTrimmed.substr(1, literalTrimmed.length - 2);
        }

        /* remove end . */
        if (literalTrimmed.endsWith(".")) {
            return literalTrimmed.substr(0, literalTrimmed.length - 1);
        }

        return literalTrimmed;
    }

    private getColumBParsing(): boolean {
        var editorConfig = workspace.getConfiguration('coboleditor');
        var parsingB = editorConfig.get<boolean>('ignorecolumn_b_onwards');
        if (parsingB === undefined || parsingB === null) {
            parsingB = false;
        }
        return parsingB;
    }

    private parseLineByLine(sourceHandler: ISourceHandler, lineNumber: number, prevToken: Token, line: string): Token {

        let token = new Token(line, prevToken);

        do {
            try {
                let endWithDot = false;

                let tcurrent: string = token.currentToken;
                let tcurrentLower: string = token.currentTokenLower;

                // continue now
                if (tcurrent.length === 0) {
                    continue;
                }

                // HACK for "set x to entry"
                if (token.prevTokenLower === "to" && tcurrentLower === "entry") {
                    continue;
                }

                if (tcurrent.endsWith(".")) {
                    tcurrent = tcurrent.substr(0, tcurrent.length - 1);
                    tcurrentLower = tcurrent.toLowerCase();
                    endWithDot = true;
                    token.endsWithDot = endWithDot;
                } else {
                    token.endsWithDot = false;
                }

                const current: string = tcurrent;
                const currentLower: string = tcurrentLower;
                const nextToken = token.nextToken;
                const nextTokenLower = token.nextTokenLower;
                const prevToken = this.trimLiteral(token.prevToken);
                const prevTokenLower = this.trimLiteral(token.prevTokenLower);
                const nextPlusOneToken = token.nextPlusOneToken;

                let prevPlusCurrent = token.prevToken + " " + current;
                //line.substr(token.prevCol, (token.currentCol + current.length) - token.prevCol);
                // let currentPlusNext = line.substr(currentCol, (nextColumn + next.length) - currentCol);

                // handle sections
                if (prevToken.length !== 0 && currentLower === "section" && (prevTokenLower !== 'exit')) {
                    if (prevTokenLower === "declare") {
                        continue;
                    }
                    let ctoken = new COBOLToken(COBOLTokenStyle.Section, lineNumber, line, prevToken, prevPlusCurrent, this.currentDivision);
                    this.currentDivision.childTokens.push(ctoken);
                    this.tokensInOrder.push(ctoken);

                    if (prevTokenLower === "working-storage" || prevTokenLower === "linkage" || prevTokenLower === "file") {
                        this.pickFields = true;
                        this.inProcedureDivision = false;
                        sourceHandler.setDumpAreaA(false);
                        sourceHandler.setDumpAreaBOnwards(!this.parseColumnBOnwards);

                        if (this.divisions.length === 0) {
                            this.divisions.push(ctoken);    /* fake division */
                            this.currentDivision = ctoken;
                        }
                    }
                    continue;
                }

                // handle divisions
                if (prevTokenLower.length !== 0 && currentLower === "division") {
                    let ctoken = new COBOLToken(COBOLTokenStyle.Division, lineNumber, line, prevPlusCurrent, prevPlusCurrent, COBOLToken.Null);
                    this.divisions.push(ctoken);
                    this.tokensInOrder.push(ctoken);
                    this.currentDivision = ctoken;

                    if (prevTokenLower === "procedure") {
                        this.inProcedureDivision = true;
                        this.pickFields = false;
                        this.procedureDivsion = ctoken;
                        sourceHandler.setDumpAreaA(true);
                        sourceHandler.setDumpAreaBOnwards(false);
                    }

                    continue;
                }

                // handle entries
                if (prevTokenLower === "entry" && current.length !== 0) {
                    let ctoken = new COBOLToken(COBOLTokenStyle.EntryPoint, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision);
                    this.tokensInOrder.push(ctoken);
                    continue;
                }

                // handle program-id
                if (prevTokenLower === "program-id" && current.length !== 0) {
                    let ctoken = new COBOLToken(COBOLTokenStyle.ProgramId, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision);
                    if (this.divisions.length === 0) {
                        this.divisions.push(ctoken);    /* fake division */
                        this.currentDivision = ctoken;
                    }

                    this.tokensInOrder.push(ctoken);
                    continue;
                }

                // handle class-id
                if (prevTokenLower === "class-id" && current.length !== 0) {
                    this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.ClassId, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision));
                    continue;
                }

                // handle enum-id
                if (prevTokenLower === "enum-id" && current.length !== 0) {
                    this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.EnumId, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision));
                    continue;
                }

                // handle interface-id
                if (prevTokenLower === "interface-id" && current.length !== 0) {
                    this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.InterfaceId, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision));
                    continue;
                }

                // handle valuetype-id
                if (prevTokenLower === "valuetype-id" && current.length !== 0) {
                    this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.ValueTypeId, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision));
                    continue;
                }

                // handle function-id
                if (prevTokenLower === "function-id" && current.length !== 0) {
                    this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.FunctionId, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision));
                    continue;
                }

                // handle method-id
                if (prevTokenLower === "method-id" && current.length !== 0) {
                    let currentLowerTrim = this.trimLiteral(currentLower);
                    let style = currentLowerTrim === "new" ? COBOLTokenStyle.Constructor : COBOLTokenStyle.MethodId;
                    if (nextTokenLower === "property") {
                        this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.Property, lineNumber, line, this.trimLiteral(nextPlusOneToken), nextToken+" "+nextPlusOneToken, this.currentDivision));
                        
                    } else {
                        this.tokensInOrder.push(new COBOLToken(style, lineNumber, line, this.trimLiteral(current), prevPlusCurrent, this.currentDivision));
                    }
                    continue;
                }
                // copybook handling
                if (prevTokenLower === "copy" && current.length !== 0) {
                    this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.CopyBook, lineNumber, line, prevPlusCurrent, prevPlusCurrent, this.currentDivision));
                    continue;
                }

                // we are in the procedure division
                if (this.currentDivision === this.procedureDivsion && endWithDot) {
                    if (!this.isValidKeyword(prevTokenLower) && !this.isValidKeyword(currentLower)) {
                        let beforeCurrent = line.substr(0, token.currentCol - 1).trim();
                        if (beforeCurrent.length === 0) {
                            let c = token.currentToken.substr(0, token.currentToken.length - 1);
                            if (c.length !== 0) {
                                if (this.isParagraph(c)) {
                                    this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.Paragraph, lineNumber, line, c, c, this.currentDivision));
                                }
                            }
                        }
                    }
                }

                // are we in the working-storage section?
                if (this.pickFields) {
                    /* only interesteding in things that are after a number */
                    if (this.isNumber(prevToken) && !this.isNumber(current)) {
                        if (!this.isValidKeyword(prevTokenLower) && !this.isValidKeyword(currentLower)) {
                            let trimToken = this.trimLiteral(current);
                            if (this.isValidLiteral(currentLower)) {
                                const style = prevToken === "78" ? COBOLTokenStyle.Constant : COBOLTokenStyle.Variable;
                                this.tokensInOrder.push(new COBOLToken(style, lineNumber, line, trimToken, trimToken, this.currentDivision));
                            }
                        }
                        continue;
                    }

                    if ((prevTokenLower === "fd" || prevTokenLower === "sd") && !this.isValidKeyword(currentLower)) {
                        let trimToken = this.trimLiteral(current);
                        if (this.isValidLiteral(currentLower)) {
                            this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.Variable, lineNumber, line, trimToken, trimToken, this.currentDivision));
                        }
                        continue;
                    }

                    if (prevTokenLower === "indexed" && currentLower === "by" && nextToken.length > 0) {
                        if (this.isValidKeyword(nextTokenLower) === false) {
                            let trimmedNextToken = this.trimLiteral(nextToken);
                            this.tokensInOrder.push(new COBOLToken(COBOLTokenStyle.Variable, lineNumber, line, trimmedNextToken, trimmedNextToken, this.currentDivision));
                        }
                    }
                }
            }
            catch (e) {
                console.log("Cobolquickparse line error: " + e);
                console.log(e.stack);
            }
        }
        while (token.moveToNextToken() === false);

        return token;
    }

    private updateEndings(sourceHandler: ISourceHandler) {
        for (let i = 0; i < this.divisions.length; i++) {
            let token = this.divisions[i];
            if (1 + i < this.divisions.length) {
                let nextToken = this.divisions[i + 1];
                token.endLine = nextToken.startLine - 1;          /* use the end of the previous line */
                token.endColumn = sourceHandler.getRawLine(token.endLine).length;
            } else {
                token.endLine = sourceHandler.getLineCount();
                token.endColumn = sourceHandler.getRawLine(token.endLine).length;
            }
        }

        for (let i = 0; i < this.divisions.length; i++) {
            let division = this.divisions[i];
            let sections = division.childTokens;
            for (let i = 0; i < sections.length; i++) {
                let token = sections[i];
                if (1 + i < sections.length) {
                    let nextToken = sections[i + 1];
                    token.endLine = nextToken.startLine - 1;          /* use the end of the previous line */
                    token.endColumn = sourceHandler.getRawLine(token.endLine).length;
                } else {
                    token.endLine = division.endLine;
                    token.endColumn = sourceHandler.getRawLine(token.endLine).length;
                }
            }
        }

        for (let i = 0; i < this.tokensInOrder.length; i++) {
            let token = this.tokensInOrder[i];
            if (token.endLine === 0) {
                token.endLine = token.startLine;
                token.endColumn = token.startColumn + token.token.length;
            }
        }
    }

    public dump() {
        for (var i = 0; i < this.tokensInOrder.length; i++) {
            let token = this.tokensInOrder[i];
            token.dump();
        }
    }
}


