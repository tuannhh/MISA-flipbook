import asyncio
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from pypdf import PdfWriter
from app import main

class SupervisorTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=main.STORAGE_ROOT)
        self.root = pathlib.Path(self.temp.name)
        self.source = self.root / 'source.pdf'
        self.pdf(1, 100, 100)

    def tearDown(self):
        self.temp.cleanup()

    def pdf(self, pages, width, height):
        writer = PdfWriter()
        for _ in range(pages):
            writer.add_blank_page(width, height)
        writer.write(str(self.source))

    async def convert(self, name):
        return await main.convert(main.ConvertRequest(
            source_key=str(self.source.relative_to(main.STORAGE_ROOT)),
            output_key=str((self.root/name).relative_to(main.STORAGE_ROOT)),pipeline_version='test'), main.INTERNAL_API_TOKEN)

    async def test_parallel_documents_use_separate_processes(self):
        with patch.object(main,'slots',asyncio.Semaphore(2)):
            results=await asyncio.gather(self.convert('a'),self.convert('b'))
        self.assertTrue(all(r['status']=='ok' for r in results),results)

    async def test_page_limit_no_partial_output(self):
        self.pdf(501,100,100)
        result=await self.convert('out')
        self.assertEqual(result['reason'],'page_limit')
        self.assertFalse((self.root/'out').exists())

    async def test_pixel_limit_no_partial_output(self):
        self.pdf(1,1,20000)
        result=await self.convert('out')
        self.assertEqual(result['reason'],'pixel_limit')
        self.assertFalse((self.root/'out').exists())

    async def test_output_budget(self):
        with patch.dict(os.environ,{'PDF_MAX_OUTPUT_BYTES':'1'}):
            result=await self.convert('out')
        self.assertEqual(result['reason'],'output_limit')
        self.assertFalse((self.root/'out').exists())

    async def test_timeout_kills_and_reaps_child(self):
        spawned=[]
        create=asyncio.create_subprocess_exec
        async def capture(*args,**kwargs):
            proc=await create(*args,**kwargs)
            spawned.append(proc)
            return proc
        with patch.object(main,'TIMEOUT_SECONDS',0.001),patch('asyncio.create_subprocess_exec',capture):
            result=await self.convert('out')
        self.assertEqual(result['reason'],'timeout')
        self.assertEqual(len(spawned),1)
        self.assertIsNotNone(spawned[0].returncode)
        self.assertFalse(pathlib.Path('/proc',str(spawned[0].pid)).exists())
        self.assertFalse((self.root/'out').exists())
        self.assertEqual((await self.convert('recovered'))['status'],'ok')

    async def test_admission_and_existing_output(self):
        with patch.object(main,'slots',asyncio.Semaphore(0)):
            with self.assertRaises(main.HTTPException) as error:
                await self.convert('out')
        self.assertEqual(error.exception.status_code,503)
        self.assertEqual((await self.convert('out'))['status'],'ok')
        with self.assertRaises(main.HTTPException) as error:
            await self.convert('out')
        self.assertEqual(error.exception.status_code,409)
        self.assertTrue((self.root/'out/pages').exists())

    async def test_source_path_traversal_rejected(self):
        with self.assertRaises(main.HTTPException):
            main._resolve_safe('../outside.pdf')

if __name__=='__main__':
    unittest.main(verbosity=2)
