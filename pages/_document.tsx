import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="en" className="dark">
            <Head />
            <body className="bg-slate-900 text-white">
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
