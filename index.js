const util = require('util');
const puppeteer = require('puppeteer');

const [_, x, name, headless] = process.argv;
console.log(headless);
if (!name) {
    console.error('Usage: script [lesson name]');
    process.exit(1);
}
const dict = {};
(async () => {
    console.log("launching Chrome");
    const browser = await puppeteer.launch({headless: !!headless});
    const page = await browser.newPage();
    page.setViewport({ width: 1366, height: 768 });

    await page.goto("https://www.duolingo.com", { timeout: 0 });
    console.log("logging in");
    const [button] = await page.$x("//a[contains(., 'I ALREADY HAVE AN ACCOUNT')]");
    if (button) await button.click();
    const [username, password] = await page.$x("//input");
    await username.type(process.env.USERNAME);
    await password.type(process.env.PASSWORD);
    const [submit] = await page.$x("//button[@type = 'submit']");
    await submit.click();
    const lesson = await page.waitForXPath(`(//*[contains(.,'${name}')])[last()]`);
    await lesson.click();
    // Waiting for user to open a course
    while (1) {
        let cantSpeak, cont, switchKeyboard, noThanks;
        await util.promisify(setTimeout)(1000);

        [switchKeyboard] = await page.$x("//button[contains(., 'Use keyboard')]");
        if (switchKeyboard) await switchKeyboard.click();
        [cantSpeak] = await page.$x("//button[contains(.,'speak now')]");
        if (cantSpeak) await cantSpeak.click();
        [cont] = await page.$x("//button[contains(.,'Continue')]");
        if (cont) {
            await cont.click();
            console.log('continueing');
            continue
        }

        [noThanks] = await page.$x("//button[contains(., 'No thanks')]");
        if (noThanks) await noThanks.click();
        const [practice] = await page.$x("(//*[contains(.,'Practice +0 XP')])[last()]");
        if (practice) {
            console.log('Lesson is done, exiting...');
            process.exit(0);
        }
        const [start] = await page.$x("(//*[contains(.,'START') or contains(.,'Practice')])[last()]");
        if (start) {
            console.log('starting');
            await start.click();
        }
        try {
            console.log('Waiting for footer');
            await page.waitForXPath("//*[@id='session/PlayerFooter']", {timeout: 1000});
            console.log('footer found');

            [switchKeyboard] = await page.$x("//button[contains(., 'Use keyboard')]");
            if (switchKeyboard) await switchKeyboard.click();
            [cantSpeak] = await page.$x("//button[contains(.,'speak now')]");
            if (cantSpeak) await cantSpeak.click();
            [cont] = await page.$x("//button[contains(.,'Continue')]");
            if (cont) {
                await cont.click();
                console.log('continueing');
                continue
            }

            console.log('waiting for question');
            await page.waitForSelector('[data-test=challenge-translate-prompt], [data-test=challenge-form-prompt], [data-test=hint-sentence], [data-test=challenge-header]', {timeout: 1000});
            console.log('question found');

            try {
                question = await page.$eval('[data-test=challenge-translate-prompt], [data-test=challenge-form-prompt], [data-test=hint-sentence]', e => e.innerText);
                console.log('Found question box %s', question);
            } catch {
                question = await page.$eval('[data-test=challenge-header]', e => e.innerText);
                console.log('read question from title %s', question);
            }

            if (!question) {
                console.log('No question found, stopping');
                await util.promisify(setTimeout)(120000);
                continue;
            }

            [switchKeyboard] = await page.$x("//button[contains(., 'Use keyboard')]");
            if (switchKeyboard) await switchKeyboard.click();
            [cantSpeak] = await page.$x("//button[contains(.,'speak now')]");
            if (cantSpeak) await cantSpeak.click();
            [cont] = await page.$x("//button[contains(.,'Continue')]");
            if (cont) {
                await cont.click();
                console.log('continueing');
                continue
            }

            const formChoices = await page.$x("//*[@role='radiogroup']/div");
            const [placeholder] = await page.$x("//*[@data-test='challenge-text-input']/../..");
            let placeholderText = '';
            if (placeholder) {
                placeholderText = await placeholder.evaluate(e => e.innerText);
            }
            question = `${question}${placeholderText}`;
            console.log('Question: %s', question);
            const answer = question in dict ? dict[question] : 'x';
            if (formChoices.length) {
                for (let idx = 0; idx < formChoices.length; idx++) {
                    const choice = formChoices[idx];
                    let choiceText = await choice.evaluate(e => e.innerText);
                    choiceText = choiceText ? choiceText.replace(/\d+/, '').trim() : choiceText;
                    console.log(answer, idx, choiceText);
                    if (answer === 'x' && idx === 0) {
                        console.log('clicking on %s', choiceText);
                        await choice.click();
                    } else if (choiceText === answer) {
                        console.log('clicking on %s', choiceText);
                        await choice.click();
                    }
                }
            } else {
                const answer = question in dict ? dict[question] : 'x';
                await page.type('textarea, input[type=text]', answer);
            }
            console.log('wait for check button be enabled');
            const check = await page.waitForXPath("//button[(contains(., 'Check') or contains(., 'Continue')) and not(@disabled)]", {timeout: 1000});
            console.log('check button is enabled');

            [switchKeyboard] = await page.$x("//button[contains(., 'Use keyboard')]");
            if (switchKeyboard) await switchKeyboard.click();
            [cantSpeak] = await page.$x("//button[contains(.,'speak now')]");
            if (cantSpeak) await cantSpeak.click();
            [cont] = await page.$x("//button[contains(.,'Continue')]");
            if (cont) {
                await cont.click();
                console.log('continueing');
                continue
            }

            await check.click();
            console.log('wait for solution');
            const solution = await page.waitForXPath("(//div[contains(.,'Report')])[last()]/..", {timeout: 1000});
            console.log('solution visible');
            let correct = await solution.$eval('h2 ~ div', e => e.innerText);
            console.log('correct; %s', correct);
            if (correct) {
                console.log('placeholder text: %s', placeholderText);
                if (placeholderText) {
                    const placeholderWords = placeholderText.split(/[\s,-\.]/);
                    const answerWords = correct.split(/[\s,-\.]/);
                    console.log('words: %s, answer: %s', placeholderWords, answerWords);
                    answerWords.forEach(w => {
                        if (placeholderWords.indexOf(w) < 0) {
                            dict[question] = w;
                        }
                    });
                } else {
                    dict[question] = correct;
                }
            }
        } catch(e) {
            continue;
        }
    }
})().then(console.log).catch(console.error);
