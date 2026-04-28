package tiles

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Upload sends a local file to an S3-compatible bucket (R2, DO Spaces, etc.).
// Configuration is read from environment variables:
//
//	TILES_S3_ENDPOINT         - e.g. https://<acct>.r2.cloudflarestorage.com
//	TILES_S3_BUCKET           - bucket name
//	TILES_S3_ACCESS_KEY_ID    - access key
//	TILES_S3_SECRET_ACCESS_KEY - secret key
//	TILES_S3_REGION           - region (default "auto")
func Upload(ctx context.Context, localPath, objectKey string) error {
	endpoint := os.Getenv("TILES_S3_ENDPOINT")
	bucket := os.Getenv("TILES_S3_BUCKET")
	accessKey := os.Getenv("TILES_S3_ACCESS_KEY_ID")
	secretKey := os.Getenv("TILES_S3_SECRET_ACCESS_KEY")
	region := os.Getenv("TILES_S3_REGION")

	if endpoint == "" || bucket == "" || accessKey == "" || secretKey == "" {
		return fmt.Errorf("tiles: S3 upload requires TILES_S3_ENDPOINT, TILES_S3_BUCKET, TILES_S3_ACCESS_KEY_ID, TILES_S3_SECRET_ACCESS_KEY")
	}
	if region == "" {
		region = "auto"
	}

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return fmt.Errorf("tiles: load AWS config: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("tiles: open %s: %w", localPath, err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return fmt.Errorf("tiles: stat %s: %w", localPath, err)
	}

	contentType := "application/x-protobuf"
	cacheControl := "public, max-age=86400"

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:       aws.String(bucket),
		Key:          aws.String(objectKey),
		Body:         f,
		ContentType:  aws.String(contentType),
		CacheControl: aws.String(cacheControl),
	})
	if err != nil {
		return fmt.Errorf("tiles: upload to s3://%s/%s: %w", bucket, objectKey, err)
	}

	log.Printf("tiles: uploaded %s (%.1f MB) to s3://%s/%s", localPath, float64(stat.Size())/(1024*1024), bucket, objectKey)
	return nil
}
