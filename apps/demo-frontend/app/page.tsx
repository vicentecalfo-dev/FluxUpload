import Link from 'next/link';

export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">Flux Upload Demo</h1>
      <p className="text-center text-slate-600">
        Ambiente de demonstracao ponta-a-ponta para multipart upload com URLs pre-assinadas.
      </p>
      <Link
        href="/uploads"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Ir para /uploads
      </Link>
    </main>
  );
}
