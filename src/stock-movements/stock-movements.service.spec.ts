import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { StockMovement } from './entities/stock-movement.entity';
import { StockMovementType } from './enums/stock-movement-type.enum';
import { StockMovementsService } from './stock-movements.service';

describe('StockMovementsService', () => {
  let service: StockMovementsService;

  const movementRepository = {} as Repository<StockMovement>;

  const transactionRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const manager = {
    getRepository: jest.fn(),
  } as unknown as EntityManager;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new StockMovementsService(
      movementRepository,
    );

    (
      manager.getRepository as jest.Mock
    ).mockReturnValue(transactionRepository);

    transactionRepository.create.mockImplementation(
      (value) => value,
    );

    transactionRepository.save.mockImplementation(
      async (value) => ({
        id: 'movement-1',
        ...value,
      }),
    );
  });

  describe('recordAdjustment', () => {
    it('records a positive adjustment as incoming stock', async () => {
      const result =
        await service.recordAdjustment(
          manager,
          {
            productId: 'product-1',
            locationId: 'location-1',
            quantityDelta: 7,
            createdById: 'user-1',
            reason: '  Initial stock  ',
          },
        );

      expect(
        transactionRepository.create,
      ).toHaveBeenCalledWith({
        productId: 'product-1',
        sourceLocationId: null,
        destinationLocationId:
          'location-1',
        quantity: 7,
        type:
          StockMovementType.ADJUSTMENT,
        transferId: null,
        createdById: 'user-1',
        reason: 'Initial stock',
      });

      expect(result.quantity).toBe(7);
    });

    it('records a negative adjustment as outgoing stock with an absolute quantity', async () => {
      await service.recordAdjustment(
        manager,
        {
          productId: 'product-1',
          locationId: 'location-1',
          quantityDelta: -4,
          createdById: 'user-1',
          reason: 'Damaged goods',
        },
      );

      expect(
        transactionRepository.create,
      ).toHaveBeenCalledWith({
        productId: 'product-1',
        sourceLocationId: 'location-1',
        destinationLocationId: null,
        quantity: 4,
        type:
          StockMovementType.ADJUSTMENT,
        transferId: null,
        createdById: 'user-1',
        reason: 'Damaged goods',
      });
    });

    it('rejects a zero adjustment', async () => {
      await expect(
        service.recordAdjustment(
          manager,
          {
            productId: 'product-1',
            locationId: 'location-1',
            quantityDelta: 0,
            createdById: 'user-1',
            reason: 'No change',
          },
        ),
      ).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(
        transactionRepository.save,
      ).not.toHaveBeenCalled();
    });
  });

  describe('recordTransfer', () => {
    it('records a transfer movement with source and destination', async () => {
      await service.recordTransfer(
        manager,
        {
          productId: 'product-1',
          sourceLocationId: 'source-1',
          destinationLocationId:
            'destination-1',
          quantity: 5,
          transferId: 'transfer-1',
          createdById: 'user-1',
        },
      );

      expect(
        transactionRepository.create,
      ).toHaveBeenCalledWith({
        productId: 'product-1',
        sourceLocationId: 'source-1',
        destinationLocationId:
          'destination-1',
        quantity: 5,
        type:
          StockMovementType.TRANSFER,
        transferId: 'transfer-1',
        createdById: 'user-1',
        reason: null,
      });
    });

    it.each([0, -1])(
      'rejects invalid transfer quantity %s',
      async (quantity) => {
        await expect(
          service.recordTransfer(
            manager,
            {
              productId: 'product-1',
              sourceLocationId: 'source-1',
              destinationLocationId:
                'destination-1',
              quantity,
              transferId: 'transfer-1',
              createdById: 'user-1',
            },
          ),
        ).rejects.toBeInstanceOf(
          BadRequestException,
        );
      },
    );
  });
});
