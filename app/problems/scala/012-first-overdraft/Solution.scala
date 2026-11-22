def firstOverdraft(txs: List[Int]): Int =
  txs.scanLeft(0)(_ + _).indexWhere(_ < 0)
