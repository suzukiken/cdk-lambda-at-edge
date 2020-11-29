import logging
import boto3
from PIL import Image
from io import BytesIO
import re

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

s3_client = boto3.client('s3')

origin_size_dirname = 'original'

def handler(event, context):
    
    logger.info(event)
    
    request = event['Records'][0]['cf']['request']
    
    region = request['origin']['s3']['region']
    bucket = request['origin']['s3']['domainName'].replace('.s3.{}.amazonaws.com'.format(region), '')
    
    logger.info(bucket)
    
    # /original/test.jpg => original/test.jpg
    request_key = request['uri'][1:]
    
    logger.info(request_key)
    
    # original/test.jpg => [original, test.jpg]
    # 200x200/test.jpg => [200x200, test.jpg]
    try:
        size, objname = request_key.split('/')
    except:
        return request
        
    logger.info(objname)
        
    if size == origin_size_dirname:
        # original
        pass
    elif re.match('^\d+x\d+$', size):
        # 200x200
        wh = [int(s) for s in size.split('x')]
    else:
        return request
    
    ext = objname.split('.')[-1].lower()
    
    if not ext in ('bmp', 'png', 'jpg', 'jpeg', 'gif', 'webp'):
        return request
    
    ext_types = {
        'bmp': 'BMP',
        'png': 'PNG',
        'jpg': 'JPEG',
        'jpeg': 'JPEG',
        'gif': 'GIF'
    }
    
    content_types = {
        'bmp': 'image/bmp',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp'
    }
    
    # if object exists
    try:
        s3_client.get_object(
            Bucket=bucket,
            Key=request_key
        )
    except s3_client.exceptions.NoSuchKey:
        pass
    else:
        return request
    
    # if object not exists
    # there must be origin image
    origin_key = '%s/%s' % (origin_size_dirname, objname)
    
    logger.info(origin_key)
    
    try:
        response = s3_client.get_object(
            Bucket=bucket,
            Key=origin_key
        )
    except s3_client.exceptions.NoSuchKey:
        pass
    else:
        file_byte_string = response['Body'].read()
        img = Image.open(BytesIO(file_byte_string))
        img.thumbnail(wh)
        
        buffer = BytesIO()
        img.save(buffer, ext_types[ext])
        buffer.seek(0)
        
        response = s3_client.put_object(
            ACL='public-read',
            Bucket=bucket,
            Key=request_key, 
            Body=buffer,
            ContentType=content_types[ext]
        )
    
    return request