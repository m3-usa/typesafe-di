import { Design } from './design';
import { inject, injectClass } from './helper';

interface MyClassParams {
    num: number;
    str: string;
    optionalBool?: boolean;
}
class MyClass {
    public readonly params: MyClassParams;

    public constructor(params: MyClassParams) {
        this.params = params;
    }

    public static newMyClass(params: { num: number; str: string }) {
        return new MyClass(params);
    }
    public static async newMyClassAsync(params: { num: number; str: string }) {
        return new MyClass(params);
    }
}

describe('inject', () => {
    it('creates a function for Design#bind', async () => {
        const {
            container: { myClass },
        } = await Design.bind('myClass', inject(MyClass.newMyClass, ['num', 'str'])).resolve({
            num: 1,
            str: 'a',
        });
        expect(myClass.params).toEqual({
            num: 1,
            str: 'a',
            optionalBool: undefined,
        });
    });

    it('accepts async function', async () => {
        const {
            container: { myClass },
        } = await Design.bind('myClass', inject(MyClass.newMyClassAsync, ['num', 'str'])).resolve({
            num: 1,
            str: 'a',
        });
        expect(myClass.params).toEqual({
            num: 1,
            str: 'a',
            optionalBool: undefined,
        });
    });

    it('accepts zero-argument function', async () => {
        const func = () => 1;
        const {
            container: { myNumber },
        } = await Design.bind('myNumber', inject(func, [])).resolve({});
        expect(myNumber).toBe(1);
    });

    // @ts-expect-error
    inject(() => {}, ['redundant']);
});

describe('injectClass', () => {
    it('creates a function for Design#bind', async () => {
        const {
            container: { myClass },
        } = await Design.bind('myClass', injectClass(MyClass, ['num', 'str', 'optionalBool'])).resolve({
            num: 1,
            str: 'a',
            optionalBool: true,
        });
        expect(myClass.params).toEqual({
            num: 1,
            str: 'a',
            optionalBool: true,
        });
    });

    it('allows omitting optional value', async () => {
        const {
            container: { myClass },
        } = await Design.bind('myClass', injectClass(MyClass, ['num', 'str'])).resolve({
            num: 1,
            str: 'a',
        });
        expect(myClass.params).toEqual({
            num: 1,
            str: 'a',
            optionalBool: undefined,
        });
    });

    // @ts-expect-error
    injectClass(MyClass, []);

    // @ts-expect-error
    injectClass(MyClass, ['num']);

    // @ts-expect-error
    injectClass(MyClass, ['num', 'str', 'redundant']);
});
