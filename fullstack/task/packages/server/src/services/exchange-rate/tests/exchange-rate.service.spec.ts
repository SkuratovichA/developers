import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { ExchangeRateService } from '../exchange-rate.service';
import { ExchangeRate } from '../../../entities';

describe('ExchangeRateService', () => {
    let service: ExchangeRateService;
    let httpService: HttpService;

    const mockedRates = [
        {
            validFor: '2024-07-04',
            order: 129,
            country: 'India',
            currency: 'Rupee',
            amount: 100,
            currencyCode: 'INR',
            rate: 27.879,
        },
    ];

    const repositoryProvider = {
        provide: getRepositoryToken(ExchangeRate),
        useValue: {
            find: jest.fn(),
            save: jest.fn(),
        },
    };

    const configServiceProvider = {
        provide: ConfigService,
        useValue: {
            get: jest.fn((key: string) => {
                switch (key) {
                    case 'CNB_EXRATE_URL':
                        return 'https://mocked-api.cnb.cz/cnbapi/exrates/daily';
                    case 'EXCHANGE_RATE_UPDATE_FREQUENCY_MINUTES':
                        return 5;
                    case 'EXCHANGE_RATE_RETRY_DELAY':
                        return 1000;
                    case 'EXCHANGE_RATE_RETRY_ATTEMPTS':
                        return 3;
                    default:
                        return null;
                }
            }),
        },
    };

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            imports: [HttpModule],
            providers: [repositoryProvider, ExchangeRateService, configServiceProvider],
        }).compile();

        service = module.get(ExchangeRateService);
        httpService = module.get(HttpService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should return cached exchange rates if available and valid', async () => {
        const cachedRates = [
            {
                id: '1',
                currency: 'USD',
                rate: 1.2,
                amount: 1,
                country: 'USA',
                validFor: new Date('2024-07-06'),
                currencyCode: 'USD',
                createdAtUtc: new Date(),
            } as ExchangeRate,
        ];

        jest.spyOn(service, 'getCachedExchangeRates').mockResolvedValueOnce(cachedRates);

        const result = await service.getExchangeRates('EN');

        expect(result.rates.length).toBe(1);
        expect(result.cached).toBe(true);
        expect(result.rates[0].currencyCode).toBe('USD');
    });

    it('should fetch exchange rates from API if cache is empty', async () => {
        const mockApiResponse: AxiosResponse = {
            data: {
                rates: mockedRates,
            },
            status: 200,
            statusText: 'OK',
            headers: {},
        } as AxiosResponse;

        jest.spyOn(httpService, 'get').mockReturnValueOnce(of(mockApiResponse));
        jest.spyOn(service, 'getCachedExchangeRates').mockResolvedValueOnce([]);

        const result = await service.getExchangeRates('en');

        expect(result.rates.length).toBe(1);
        expect(result.cached).toBe(false);
        expect(result.rates[0].currencyCode).toBe(mockedRates[0].currencyCode);
    });

    it('should cache the fetched exchange rates from API', async () => {
        const mockApiResponse: AxiosResponse = {
            data: {
                rates: mockedRates,
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {
                headers: new AxiosHeaders(),
            },
        };

        jest.spyOn(httpService, 'get').mockReturnValueOnce(of(mockApiResponse));
        jest.spyOn(service, 'getCachedExchangeRates').mockResolvedValueOnce([]);
        jest.spyOn(service, 'cacheExchangeRates').mockImplementationOnce(async () => {});

        const result = await service.getExchangeRates('en');

        expect(result.rates.length).toBe(1);
        expect(result.cached).toBe(false);
        expect(service.cacheExchangeRates).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should handle API errors and return empty rates array', async () => {
        const mockApiError: AxiosError = {
            isAxiosError: true,
            toJSON: () => ({}),
            name: 'AxiosError',
            message: 'Network Error',
            code: 'ECONNABORTED',
            response: undefined,
        } as AxiosError;

        jest.spyOn(httpService, 'get').mockReturnValueOnce(throwError(() => mockApiError));
        jest.spyOn(service, 'getCachedExchangeRates').mockResolvedValueOnce([]);

        const result = await service.getExchangeRates('en');

        expect(result.rates.length).toBe(0);
        expect(result.cached).toBe(false);
    });
});