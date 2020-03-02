test:
	docker-compose build
	docker-compose run test
	docker-compose down --volumes
