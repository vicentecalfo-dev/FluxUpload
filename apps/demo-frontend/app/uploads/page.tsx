import dynamic from 'next/dynamic';

const UploadsClient = dynamic(() => import('./UploadsClient'), {
  ssr: false,
});

export default function UploadsPage(): JSX.Element {
  return <UploadsClient />;
}
